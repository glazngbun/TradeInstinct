import { useState, useEffect } from "react";
import UploadCSV from "./UploadCSV";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import "./Dashboard.css";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchData() {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dashboard/summary`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to load dashboard");
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) return <div className="dashboard">Loading...</div>;
  if (error) return <div className="dashboard">Error: {error}</div>;

  const totalFlags =
    data.flag_summary?.reduce(
      (sum, item) => sum + Number(item.count),
      0
    ) ?? 0;

  const score = Math.max(0, 100 - totalFlags * 5);

  const mostCommon =
    [...(data.flag_summary || [])].sort(
      (a, b) => Number(b.count) - Number(a.count)
    )[0];

  const chartData =
    data.flag_summary?.map((f) => ({
      name: f.flag_type.replaceAll("_", " "),
      count: Number(f.count),
    })) ?? [];

  const tickers = [
  ...new Set(data?.heatmapData?.map((d) => d.ticker) || []),
];

const dates = [
  ...new Set(
    data?.heatmapData?.map((d) =>
      new Date(d.date).toLocaleDateString()
    ) || []
  ),
];

const lookup = {};

(data?.heatmapData || []).forEach((d) => {
  lookup[
    `${d.ticker}-${new Date(d.date).toLocaleDateString()}`
  ] = d;
});

  return (
    <div className="dashboard">
      <header className="header">
        <h1>TradeInstinct</h1>
        <p>Behavioral Trading Analytics</p>
      </header>

      <UploadCSV />

      <div className="stats-grid">
        <div className="card">
          <span>Behavior Score</span>
          <h2>{score}</h2>
        </div>

        <div className="card">
          <span>Total Flags</span>
          <h2>{totalFlags}</h2>
        </div>

        <div className="card">
          <span>Most Common Bias</span>
          <h2>{mostCommon?.flag_type ?? "None"}</h2>
        </div>

        <div className="card">
          <span>Patterns Found</span>
          <h2>{data.flag_summary?.length ?? 0}</h2>
        </div>
      </div>

      <div className="panel">
        <h2>Behavioral Breakdown</h2>

        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <h2>Insights</h2>

        <ul className="insights">
          <li>Total behavioral events detected: {totalFlags}</li>

          <li>
            Most frequent behavior:{" "}
            {mostCommon?.flag_type?.replaceAll("_", " ") ?? "None"}
          </li>

          <li>
            Average discipline score: {score}/100
          </li>
        </ul>
      </div>

      <div className="panel">
  <h2>Activity Heatmap</h2>

  <div className="heatmap-wrapper">
    <table className="heatmap-table">
      <thead>
        <tr>
          <th>Ticker</th>

          {dates.map((date) => (
            <th key={date}>
              {new Date(date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {tickers.map((ticker) => (
          <tr key={ticker}>
            <td className="ticker-cell">{ticker}</td>

            {dates.map((date) => {
              const item =
                lookup[
                  `${ticker}-${new Date(date).toLocaleDateString()}`
                ];

              const flags = item
                ? Number(item.flag_count)
                : 0;

              const color =
                flags === 0
                 ? "#2f2a26"
                : flags === 1
                 ? "#0e4429"
                : flags === 2
                  ? "#006d32"
                : flags === 3
                    ? "#26a641"
                : "#39d353";
              return (
                <td key={`${ticker}-${date}`}>
                  <div
                    className="heat-square"
                    style={{
                      backgroundColor: color,
                    }}
                    title={`${ticker}
Flags: ${flags}`}
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
      <div className="panel">
        <h2>Recent Flags</h2>

        {data.recentFlags?.length ? (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Ticker</th>
                <th>Confidence</th>
              </tr>
            </thead>

            <tbody>
              {data.recentFlags.map((flag, idx) => (
                <tr key={idx}>
                  <td>{flag.flag_type}</td>
                  <td>{flag.ticker}</td>
                  <td>
                    {Math.round(
                      Number(flag.confidence) * 100
                    )}
                    %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No recent flags.</p>
        )}
      </div>
    </div>
  );
}