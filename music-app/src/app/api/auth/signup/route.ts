// music-app/src/app/api/auth/signup/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase/client";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { name, email, password, role = "user", metadata = {} } = body;

		// Basic field validation
		if (!name || !email || !password) {
			return NextResponse.json(
				{ message: "Missing required fields" },
				{ status: 400 }
			);
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return NextResponse.json({ message: "Invalid email format" }, { status: 400 });
		}

		if (password.length < 6) {
			return NextResponse.json(
				{ message: "Password must be at least 6 characters" },
				{ status: 400 }
			);
		}

		// Check if user already exists
		const { data: existingUser, error: checkError } = await supabase
			.from("users")
			.select("email")
			.eq("email", email)
			.maybeSingle();

		if (checkError) {
			return NextResponse.json({ message: "Error checking user" }, { status: 500 });
		}

		if (existingUser) {
			return NextResponse.json({ message: "User already exists" }, { status: 409 });
		}

		// Hash password
		const hashedPassword = await bcrypt.hash(password, 10);

		// Insert new user
		const { data: newUser, error: insertError } = await supabase
			.from("users")
			.insert([
				{
					name,
					email,
					password: hashedPassword,
					role,
					...metadata, // Spread optional metadata (like phone, address, etc.)
				},
			])
			.select("id, name, email, role, created_at")
			.single();

		if (insertError) {
			return NextResponse.json({ message: "Failed to create user" }, { status: 500 });
		}

		return NextResponse.json(
			{ message: "User created successfully", user: newUser },
			{ status: 201 }
		);
	} catch (error) {
		console.error("Signup error:", error);
		return NextResponse.json({ message: "Internal server error" }, { status: 500 });
	}
}