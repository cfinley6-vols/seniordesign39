import { NextRequest, NextResponse } from "next/server";
import { createUser } from "@/app/lib/db";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password)
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 }
    );

  try {
    const user = createUser(email, password);
    const res = NextResponse.json({ message: "User created", user });

    res.cookies.set("session_user", user.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return res;
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}