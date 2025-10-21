import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail } from "@/app/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
	const { email, password } = await req.json();

	if (!email || !password)
		return NextResponse.json(
			{ error: "Email and password required" },
			{ status: 400 }
		);

	const user = await getUserByEmail(email) as { id: string; email: string; password_hash: string } | null;
	if (!user || !bcrypt.compareSync(password, user.password_hash)) {
		return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
	}

	const res = NextResponse.json({
		message: "Login successful",
		user: { id: user.id, email: user.email },
	});

	res.cookies.set("session_user", user.id, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: "/",
		maxAge: 60 * 60 * 24 * 7,
	});

	return res;
}