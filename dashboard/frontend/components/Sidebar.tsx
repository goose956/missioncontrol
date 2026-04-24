"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "⬡" },
  { href: "/projects", label: "Projects", icon: "🗂" },
  { href: "/ideas", label: "Ideas", icon: "💡" },
  { href: "/landing-pages", label: "Landing Pages", icon: "🧱" },
  { href: "/media", label: "Media", icon: "🎬" },
  { href: "/chat/ad-creator", label: "Ad Creator", icon: "🎯" },
  { href: "/chat/spec-bot", label: "Specification", icon: "📋" },
  { href: "/chat/coder", label: "Code Assistant", icon: "💻" },
  { href: "/files", label: "Files", icon: "📁" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-48 bg-white border-r border-gray-200 flex flex-col shrink-0 shadow-sm">
      <div className="p-4 border-b border-gray-200">
        <div className="text-xs font-bold text-gray-400 tracking-widest uppercase">Mission</div>
        <div className="text-sm font-bold text-gray-900">Control</div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              (item.href.startsWith("/chat/")
                ? pathname.startsWith(item.href)
                : pathname === item.href)
                ? "bg-indigo-50 text-indigo-700 font-medium"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-gray-200 text-xs text-gray-400">
        Local First
      </div>
    </aside>
  );
}
