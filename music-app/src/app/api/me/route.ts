import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserById } from "@/app/lib/db";

export async function GET() {
	const cookieStore = cookies();
	const sessionUser = (await cookieStore).get("session_user")?.value;

	if (!sessionUser) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	const user = await getUserById(sessionUser) as { id: string; email: string } | null;
	if (!user) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}

	return NextResponse.json({
		id: user.id,
		email: user.email,
	});
}