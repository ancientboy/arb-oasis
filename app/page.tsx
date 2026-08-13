export default function Home() {
  return (
    <main className="dashboard-shell">
      <iframe
        className="dashboard-frame"
        src="/dashboard.html"
        title="ArbOasis market-neutral research dashboard"
      />
    </main>
  );
}
