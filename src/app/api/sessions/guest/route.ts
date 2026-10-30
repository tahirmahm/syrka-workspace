import { guestHandler } from "../../../../lib/sessions/scoped-guests";
export const runtime = "nodejs";
export const maxDuration = 300;
export { guestHandler as GET, guestHandler as POST };
