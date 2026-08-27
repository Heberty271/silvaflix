"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({
  children,
  requireAdmin,
  showSearch = true,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
  showSearch?: boolean;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.push("/login");
    else if (requireAdmin && user.role !== "admin") router.push("/");
  }, [loading, user, requireAdmin, router]);

  if (loading || !user || (requireAdmin && user.role !== "admin")) return null;

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="lg:pl-60">
        {showSearch && <TopBar />}
        {children}
      </div>
    </div>
  );
}
