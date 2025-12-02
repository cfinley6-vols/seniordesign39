// music-app/src/app/api/auth/login/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase/client";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
	try {
		const { email, password } = await request.json();
		// Validate input
		if (!email || !password) {
			return NextResponse.json(
				{ message: "Email and password are required" },
				{ status: 400 }
			);
		}
		// Fetch user from Supabase
		const { data: user, error } = await supabase
			.from("users")
			.select("*")
			.eq("email", email)
			.maybeSingle();
		if (error) {
			return NextResponse.json(
				{ message: "Error fetching user" },
				{ status: 500 }
			);
		}
		if (!user) {
			return NextResponse.json(
				{ message: "Invalid email or password" },
				{ status: 401 }
			);
		}
		// Compare password
		const isMatch = await bcrypt.compare(password, user.password);
		if (!isMatch) {
			return NextResponse.json(
				{ message: "Invalid email or password" },
				{ status: 401 }
			);
		}
		// Login success - return basic user data (omit password)
		return NextResponse.json(
			{
				message: "Login successful",
				user: {
					id: user.id,
					name: user.name,
					email: user.email,
					role: user.role,
					created_at: user.created_at,
				},
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error("Login error:", error);
		return NextResponse.json(
			{ message: "Internal server error" },
			{ status: 500 }
		);
	}
}