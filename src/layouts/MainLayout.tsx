import { Outlet } from "react-router-dom";
import { Navbar } from "../components/Navbar";

export const MainLayout = () => {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-28 -left-20 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl live-float" />
        <div className="absolute top-1/4 -right-24 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl live-float [animation-delay:0.8s]" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl live-float [animation-delay:1.6s]" />
        <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.22)_1px,transparent_0)] [background-size:32px_32px]" />
      </div>
      <Navbar />
      <main className="relative z-10 page-enter">
        <Outlet />
      </main>
    </div>
  );
};
