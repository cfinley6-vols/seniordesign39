// music-app/src/app/components/Navbar.tsx
import AuthButton from "@/app/components/AuthButton";
import HomePageButton from "@/app/components/HomePageButton";
import DashboardButton from "./DashboardButton";

export default function Navbar() {
	return (
		<nav className="bg-white shadow-md sticky top-0 z-50">
			<div className="max-w-7xl mx-auto px-2 py-4 flex items-center justify-between">
				<HomePageButton />
				<div className="flex items-center space-x-3">
					<DashboardButton />
					<AuthButton />
				</div>
			</div>
		</nav>
	)
}