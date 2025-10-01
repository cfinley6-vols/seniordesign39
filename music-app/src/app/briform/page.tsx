export default function Briform() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-white to-purple-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl p-10 max-w-lg w-full text-center">
        <h1 className="text-3xl font-bold text-indigo-700 mb-4">
          Briform Copy Displayed Here
        </h1>
        <p className="text-gray-600 mb-6">
          This is where your Briform content will be shown. You can add more details,
          forms, or actions here depending on your needs.
        </p>
        <button className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition">
          Get Started
        </button>
      </div>
    </div>
  );
}