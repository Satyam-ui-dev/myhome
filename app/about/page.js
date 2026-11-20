export default function AboutPage() {
  return (
    <main>
      <h2>About Home Control</h2>
      <section className="card about-card">
        <h3>Home automation dashboard</h3>
        <p>This website lets you control two lights, a fan, and a 5-pin socket connected to an ESP32.</p>
        <p>The Analysis page shows each device's status, recorded ON time, daily usage, and recent activity.</p>
      </section>
      <section className="card about-card">
        <h3>Power ratings used for energy estimates</h3>
        <table>
          <thead><tr><th>Device</th><th>Rated power</th></tr></thead>
          <tbody>
            <tr><td>Light 1</td><td>15 W</td></tr>
            <tr><td>Light 2</td><td>15 W</td></tr>
            <tr><td>Fan</td><td>60 W</td></tr>
            <tr><td>5-pin socket</td><td>100 W</td></tr>
          </tbody>
        </table>
        <p className="muted">Energy is estimated from recorded ON time: kWh = power in watts × hours ÷ 1,000. Actual consumption may differ from rated-power estimates.</p>
      </section>
    </main>
  );
}
