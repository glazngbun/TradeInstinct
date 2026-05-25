import { useState } from "react";

export default function UploadCSV() {
  const [file,    setFile]    = useState(null);
  const [status,  setStatus]  = useState(""); // feedback to user
  const [loading, setLoading] = useState(false);

  async function handleUpload() {
    if (!file) return setStatus("Please select a CSV file first.");

    const formData = new FormData();
    formData.append("csvFile", file);

    setLoading(true);
    setStatus("");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dashboard/upload-csv`,
        {
          method: "POST",
          credentials: "include",  // sends HTTP-only cookie
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.message || "Upload failed.");
      } else {
        setStatus(data.message);
      }

    } catch (err) {
      console.error(err);
      setStatus("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Upload Trade History</h1>

      <input
        type="file"
        accept=".csv"
        onChange={(e) => {
          setFile(e.target.files[0]);
          setStatus("");
        }}
      />

      <button onClick={handleUpload} disabled={loading}>
        {loading ? "Uploading..." : "Upload"}
      </button>

      {status && <p>{status}</p>}
    </div>
  );
}