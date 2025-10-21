import { NextResponse } from "next/server";

export async function GET() {
  const res = NextResponse.redirect("http://127.0.0.1:3000/");
  res.cookies.set("session_user", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
  return res;
}