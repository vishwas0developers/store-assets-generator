/**
 * Scrcpy v4.1 Binary Control Message Serializer & Stream Demuxer Helpers
 *
 * Direct binary protocol matching scrcpy's server interface (com.genymobile.scrcpy)
 * <30ms latency, zero shell execution overhead.
 */

export const SC_POINTER_ID_MOUSE = -1n;
export const SC_POINTER_ID_GENERIC_FINGER = -2n;

export enum ScrcpyControlMessageType {
  INJECT_KEYCODE = 0,
  INJECT_TEXT = 1,
  INJECT_TOUCH_EVENT = 2,
  INJECT_SCROLL_EVENT = 3,
  BACK_OR_SCREEN_ON = 4,
  EXPAND_NOTIFICATION_PANEL = 5,
  EXPAND_SETTINGS_PANEL = 6,
  COLLAPSE_PANELS = 7,
  GET_CLIPBOARD = 8,
  SET_CLIPBOARD = 9,
  SET_DISPLAY_POWER = 10,
  ROTATE_DEVICE = 11,
}

export enum AndroidMotionEventAction {
  DOWN = 0,
  UP = 1,
  MOVE = 2,
  CANCEL = 3,
}

export enum AndroidKeyEventAction {
  DOWN = 0,
  UP = 1,
}

/**
 * Converts a float 0.0 .. 1.0 to 16-bit fixed point (0x0000 .. 0xffff)
 */
function floatToU16fp(val: number): number {
  const clamped = Math.max(0, Math.min(1, val));
  return Math.floor(clamped === 1 ? 0xffff : clamped * 0x10000);
}

/**
 * Converts a float -1.0 .. 1.0 to 16-bit signed fixed point
 */
function floatToI16fp(val: number): number {
  const clamped = Math.max(-1, Math.min(1, val));
  return Math.floor(clamped === 1 ? 0x7fff : clamped * 0x8000);
}

/**
 * Serializes an INJECT_TOUCH_EVENT control message (32 bytes)
 */
export function serializeInjectTouchEvent(opts: {
  action: AndroidMotionEventAction;
  x: number;
  y: number;
  width: number;
  height: number;
  pointerId?: bigint;
  pressure?: number;
  buttons?: number;
  actionButton?: number;
}): Buffer {
  const buf = Buffer.alloc(32);
  buf.writeUInt8(ScrcpyControlMessageType.INJECT_TOUCH_EVENT, 0);
  buf.writeUInt8(opts.action, 1);
  buf.writeBigInt64BE(opts.pointerId ?? SC_POINTER_ID_GENERIC_FINGER, 2); // default -2n (GENERIC_FINGER)

  buf.writeInt32BE(Math.round(opts.x), 10);
  buf.writeInt32BE(Math.round(opts.y), 14);
  buf.writeUInt16BE(Math.max(1, Math.round(opts.width)), 18);
  buf.writeUInt16BE(Math.max(1, Math.round(opts.height)), 20);

  const pressureFp = floatToU16fp(opts.pressure ?? (opts.action === AndroidMotionEventAction.UP ? 0 : 1));
  buf.writeUInt16BE(pressureFp, 22);

  buf.writeUInt32BE(opts.actionButton ?? 0, 24);
  const defaultButtons = opts.action === AndroidMotionEventAction.UP ? 0 : 1; // 1 = AMOTION_EVENT_BUTTON_PRIMARY
  buf.writeUInt32BE(opts.buttons ?? defaultButtons, 28);

  return buf;
}

/**
 * Serializes an INJECT_KEYCODE control message (14 bytes)
 */
export function serializeInjectKeyCode(opts: {
  action: AndroidKeyEventAction;
  keycode: number;
  repeat?: number;
  metastate?: number;
}): Buffer {
  const buf = Buffer.alloc(14);
  buf.writeUInt8(ScrcpyControlMessageType.INJECT_KEYCODE, 0);
  buf.writeUInt8(opts.action, 1);
  buf.writeUInt32BE(opts.keycode, 2);
  buf.writeUInt32BE(opts.repeat ?? 0, 6);
  buf.writeUInt32BE(opts.metastate ?? 0, 10);
  return buf;
}

/**
 * Serializes an INJECT_SCROLL_EVENT control message (21 bytes)
 */
export function serializeInjectScrollEvent(opts: {
  x: number;
  y: number;
  width: number;
  height: number;
  hscroll: number; // -1 .. 1
  vscroll: number; // -1 .. 1
  buttons?: number;
}): Buffer {
  const buf = Buffer.alloc(21);
  buf.writeUInt8(ScrcpyControlMessageType.INJECT_SCROLL_EVENT, 0);

  buf.writeInt32BE(Math.round(opts.x), 1);
  buf.writeInt32BE(Math.round(opts.y), 5);
  buf.writeUInt16BE(Math.max(1, Math.round(opts.width)), 9);
  buf.writeUInt16BE(Math.max(1, Math.round(opts.height)), 11);

  buf.writeInt16BE(floatToI16fp(opts.hscroll), 13);
  buf.writeInt16BE(floatToI16fp(opts.vscroll), 15);
  buf.writeUInt32BE(opts.buttons ?? 0, 17);

  return buf;
}

/**
 * Serializes a SET_DISPLAY_POWER control message (2 bytes)
 */
export function serializeSetDisplayPower(on: boolean): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt8(ScrcpyControlMessageType.SET_DISPLAY_POWER, 0);
  buf.writeUInt8(on ? 1 : 0, 1);
  return buf;
}

/**
 * Serializes a RESET_VIDEO control message (1 byte, opcode 17)
 * Signals the encoder to emit an immediate IDR keyframe.
 * Use after a new WebSocket client connects to eliminate the wait for the next scheduled IDR.
 */
export function serializeResetVideo(): Buffer {
  const buf = Buffer.alloc(1);
  buf.writeUInt8(17, 0); // TYPE_RESET_VIDEO = 17
  return buf;
}

/**
 * Serializes an INJECT_TEXT control message (1 + 4 + text.length bytes)
 */
export function serializeInjectText(text: string): Buffer {
  const textBuf = Buffer.from(text, "utf-8");
  const buf = Buffer.alloc(1 + 4 + textBuf.length);
  buf.writeUInt8(ScrcpyControlMessageType.INJECT_TEXT, 0);
  buf.writeUInt32BE(textBuf.length, 1);
  textBuf.copy(buf, 5);
  return buf;
}

/**
 * Scrcpy Stream Packet Header Flags (from Streamer.java)
 */
export const PACKET_FLAG_CONFIG = 1n << 62n;
export const PACKET_FLAG_KEY_FRAME = 1n << 61n;

export interface ScrcpyMediaPacket {
  pts: bigint;
  isConfig: boolean;
  isKeyFrame: boolean;
  data: Buffer;
}

/**
 * Helper class to parse incoming raw Scrcpy video socket stream data
 */
export class ScrcpyStreamParser {
  private buffer: Buffer = Buffer.alloc(0);
  private headerState: "dummy" | "device_name" | "codec_id" | "session_meta" | "packets" = "dummy";

  public deviceName: string = "";
  public codecId: number = 0;
  public width: number = 0;
  public height: number = 0;

  constructor(
    private options: {
      sendDummyByte?: boolean;
      sendDeviceMeta?: boolean;
      sendCodecMeta?: boolean;
      sendFrameMeta?: boolean;
    } = {}
  ) {
    if (options.sendDummyByte === false) this.headerState = "device_name";
    if (options.sendDeviceMeta === false) this.headerState = "codec_id";
  }

  public parse(chunk: Buffer, onPacket: (packet: ScrcpyMediaPacket) => void): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length > 0) {
      if (this.headerState === "dummy") {
        if (this.buffer.length < 1) break;
        // Skip dummy byte 0x00
        this.buffer = this.buffer.subarray(1);
        this.headerState = this.options.sendDeviceMeta !== false ? "device_name" : "codec_id";
      }

      if (this.headerState === "device_name") {
        if (this.buffer.length < 64) break;
        this.deviceName = this.buffer.subarray(0, 64).toString("utf-8").replace(/\0/g, "").trim();
        this.buffer = this.buffer.subarray(64);
        this.headerState = this.options.sendCodecMeta !== false ? "codec_id" : "session_meta";
      }

      if (this.headerState === "codec_id") {
        if (this.buffer.length < 4) break;
        this.codecId = this.buffer.readUInt32BE(0);
        this.buffer = this.buffer.subarray(4);
        this.headerState = "session_meta";
      }

      if (this.headerState === "session_meta") {
        if (this.buffer.length < 12) break;
        // 4 bytes flags, 4 bytes width, 4 bytes height
        this.width = this.buffer.readUInt32BE(4);
        this.height = this.buffer.readUInt32BE(8);
        this.buffer = this.buffer.subarray(12);
        this.headerState = "packets";
      }

      if (this.headerState === "packets") {
        if (this.options.sendFrameMeta !== false) {
          // Packet header: 8 bytes (PTS + Flags), 4 bytes size
          if (this.buffer.length < 12) break;

          const ptsAndFlags = this.buffer.readBigUInt64BE(0);
          const size = this.buffer.readUInt32BE(8);

          if (this.buffer.length < 12 + size) break; // wait for full payload

          const isConfig = (ptsAndFlags & PACKET_FLAG_CONFIG) !== 0n;
          const isKeyFrame = (ptsAndFlags & PACKET_FLAG_KEY_FRAME) !== 0n;
          const pts = ptsAndFlags & ~(PACKET_FLAG_CONFIG | PACKET_FLAG_KEY_FRAME);

          const data = Buffer.from(this.buffer.subarray(12, 12 + size));
          this.buffer = this.buffer.subarray(12 + size);

          onPacket({ pts, isConfig, isKeyFrame, data });
        } else {
          // Raw stream without frame meta (raw NAL units)
          const data = Buffer.from(this.buffer);
          this.buffer = Buffer.alloc(0);
          onPacket({ pts: 0n, isConfig: false, isKeyFrame: false, data });
        }
      }
    }
  }
}
