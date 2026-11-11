import config from "../../../config";
import { jwtHelpers } from "../../../helpers/jwtHelpers";

export function verifyWebSocketToken(ws: any, token: string) {
  if (!token) {
    ws.send(
      JSON.stringify({ type: "error", message: "You are not authenticated" })
    );
    return null;
  }
  try {
    const decoded = jwtHelpers.verifyToken(
      token,
      config.jwt.jwt_secret as string
    );
    return decoded;
  } catch (error: any) {
    const errorMessage =
      error.name === "TokenExpiredError"
        ? "Token has expired!"
        : "Invalid token!";
    ws.send(JSON.stringify({ type: "error", message: errorMessage }));
    return null;
  }
}
