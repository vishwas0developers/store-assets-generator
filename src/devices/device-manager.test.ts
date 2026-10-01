import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  archiveDevice,
  createDevice,
  DeviceIdCollisionError,
  DeviceInUseError,
  deleteDevice,
  duplicateDevice,
  exportDeviceGlb,
  findDeviceReferences,
  importDevice,
  parseDeviceGlb,
  unarchiveDevice,
  validateGlbImport,
} from "./device-manager.js";
import { listDevices, reloadRegistry } from "./registry.js";
import { CURRENT_SCHEMA_VERSION, type DeviceDefinition } from "./schema.js";

const CONFIG_PATH = path.join(process.cwd(), "devices", "catalogue.json");

function testDef(id: string): DeviceDefinition {
  return {
    id, name: `Test ${id}`, vendor: "Test", platforms: ["google-play"], formFactor: "phone",
    geometry: { width: 1080, height: 2400, thickness: 80, cornerRadius: 30 },
    screenInset: { top: 30, left: 30, width: 1020, height: 2340 },
    bezelWidth: 16, edgeProfile: "curved",
    cutout: { type: "punch-hole", size: { width: 36, height: 36 } },
    cameraIsland: {
      style: "square-island", position: { xPct: 0.05, yPct: 0.03 },
      size: { widthPct: 0.24, heightPct: 0.11 }, cornerRadius: 20,
      lenses: [{ xPct: 0.17, yPct: 0.085, diameterPct: 0.09 }],
    },
    buttons: [{ face: "right", kind: "power", offsetPct: 0.22, lengthPct: 0.06 }],
    ports: [{ face: "bottom", kind: "usb-c", offsetPct: 0.5 }],
    body: "#111111", accent: "#333333", railMaterial: "aluminum",
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

async function demo() {
  const backup = fs.readFileSync(CONFIG_PATH, "utf-8");
  try {
    // -- Import validation: rejects a non-GLB buffer at the container stage --
    const garbage = await validateGlbImport(Buffer.from("not a glb file at all"));
    assert.strictEqual(garbage.ok, false, "garbage buffer must fail validation");
    assert.ok(garbage.errors.some((e) => e.stage === "container"), "garbage buffer must fail at the container stage");

    // -- Import validation: accepts our own procedural builder's output --
    const def = testDef("__test_import_device__");
    const glb = await exportDeviceGlb(def);
    const validation = await validateGlbImport(glb);
    assert.strictEqual(validation.ok, true, `own-builder GLB should validate: ${JSON.stringify(validation.errors)}`);
    assert.strictEqual(validation.extras?.id, def.id, "validated extras.id must match");

    // -- Round-trip parity: build -> parse -> re-export -> re-parse, extras/roles stable --
    const parsedOnce = await parseDeviceGlb(glb);
    const rolesOnce = [...parsedOnce.nodesByRole.keys()].sort();
    const glbAgain = await exportDeviceGlb(def);
    const parsedTwice = await parseDeviceGlb(glbAgain);
    const rolesTwice = [...parsedTwice.nodesByRole.keys()].sort();
    assert.deepStrictEqual(rolesTwice, rolesOnce, "role set must be identical across rebuilds of the same definition");
    assert.strictEqual(parsedTwice.root.userData.id, parsedOnce.root.userData.id, "device-root id must round-trip identically");
    assert.strictEqual(parsedTwice.root.userData.schemaVersion, parsedOnce.root.userData.schemaVersion, "schemaVersion must round-trip identically");

    // -- CRUD: create, duplicate, archive (hidden from default list), reference scan, delete --
    createDevice(def);
    assert.throws(() => createDevice(def), DeviceIdCollisionError, "creating a duplicate id must be rejected");

    const dup = duplicateDevice(def.id, "__test_import_device___copy");
    assert.strictEqual(dup.name, `${def.name} copy`, "duplicate must get a \"copy\" name suffix");
    assert.notStrictEqual(dup.id, def.id, "duplicate must have a distinct id");

    assert.ok(listDevices().some((d) => d.id === def.id), "newly created device must appear in listDevices() by default");
    archiveDevice(def.id);
    assert.ok(!listDevices().some((d) => d.id === def.id), "archived device must not appear in listDevices() by default");
    assert.ok(listDevices({ includeArchived: true }).some((d) => d.id === def.id), "archived device must still appear with includeArchived");
    unarchiveDevice(def.id);
    assert.ok(listDevices().some((d) => d.id === def.id), "unarchived device must reappear in listDevices() by default");

    const refs = findDeviceReferences(def.id);
    assert.deepStrictEqual(refs, [], "a device with no stored applications must have zero references");

    // -- Hard delete is blocked when an application references the device --
    const fakeApplicationDir = path.join(process.cwd(), "output", "applications", "__test_application__");
    fs.mkdirSync(fakeApplicationDir, { recursive: true });
    fs.writeFileSync(path.join(fakeApplicationDir, "application.json"), JSON.stringify({ screens: [{ device: def.id }] }));
    try {
      const refsWithApplication = findDeviceReferences(def.id);
      assert.deepStrictEqual(refsWithApplication, ["__test_application__"], "a referencing application must be found by the reverse-reference scan");
      assert.throws(() => deleteDevice(def.id), DeviceInUseError, "deleting a referenced device must be blocked");
    } finally {
      fs.rmSync(fakeApplicationDir, { recursive: true, force: true });
    }

    deleteDevice(dup.id);
    assert.ok(!listDevices({ includeArchived: true }).some((d) => d.id === dup.id), "deleted duplicate must be gone");
    deleteDevice(def.id);
    assert.ok(!listDevices({ includeArchived: true }).some((d) => d.id === def.id), "deleted device must be gone");

    // -- Import path: importDevice registers via overrideGlbPath, id collision enforced --
    const importPath = path.join(process.cwd(), "devices/3d", "__test_imported__.glb");
    const importedDef = await importDevice(glb, importPath, {});
    assert.strictEqual(importedDef.overrideGlbPath, importPath, "imported device must record overrideGlbPath");
    await assert.rejects(() => importDevice(glb, importPath, {}), /already exists/, "re-importing the same id without replaceId must be rejected");
    deleteDevice(importedDef.id);
    if (fs.existsSync(importPath)) fs.unlinkSync(importPath);

    console.log("device-manager.test.ts: all checks passed");
  } finally {
    fs.writeFileSync(CONFIG_PATH, backup);
    reloadRegistry();
  }
}

demo();
