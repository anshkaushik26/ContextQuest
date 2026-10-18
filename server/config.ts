/** Lets the last card finish its flight before the board opens. */
export const REVEAL_SETTLE_MS = 2_600;
/**
 * There is no countdown: each phase moves on when everyone has finished. A player who has
 * been disconnected this long stops holding the team up (their turn is handled for them).
 */
export const DROP_GRACE_MS = 20_000;
/** A player who drops out of the lobby keeps their seat this long. */
export const LOBBY_GRACE_MS = 45_000;
/** A timeline tile being dragged is reserved for its holder this long without a refresh. */
export const HOLD_MS = 8_000;
/** Rooms where nobody has been connected for this long are deleted. */
export const ABANDONED_ROOM_MS = 15 * 60_000;
/** Hard ceiling on any room's lifetime. */
export const MAX_ROOM_AGE_MS = 6 * 60 * 60_000;
/** Chat limits. */
export const CHAT_MAX_LEN = 240;
export const CHAT_KEEP = 80;
export const CHAT_MIN_GAP_MS = 350;
