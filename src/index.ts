import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express();
app.use(express.json());

/* ---------------- DB CONNECTION ---------------- */

let cached = global.mongoose

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null }
}

async function connectDB() {

  if (cached.conn) return cached.conn

  if (!cached.promise) {
    cached.promise = mongoose.connect("mongodb+srv://logistics:universal123@shipment.uuywqxb.mongodb.net/?appName=shipment")
  }

  cached.conn = await cached.promise
  return cached.conn
}

/* ---------------- MODEL ---------------- */

interface IShipment {
  awb_no: string
  pickup_date: string
  from: string
  to: string
  status: string
  delivery_date: string
  delivery_time: string
  recipient: string
  reference_no: string
}

const shipmentSchema = new mongoose.Schema<IShipment>({

  awb_no: {
    type: String,
    unique: true
  },
  pickup_date: String,
  from: String,
  to: String,
  status: String,
  delivery_date: String,
  delivery_time: String,
  recipient: String,
  reference_no: String

})

const Shipment =
  mongoose.models.Shipment ||
  mongoose.model<IShipment>("Shipment", shipmentSchema);

/* ---------------- ROUTES ---------------- */

// Home route - HTML
app.get('/', (req, res) => {
  res.type('html').send(`
    <!doctype html>
    <html>
<head>
    <title>AWB Tracking</title>
    <link rel="icon" href="/favicon.ico" />
    <script src="https://cdn.jsdelivr.net/npm/papaparse@5.3.2/papaparse.min.js"></script>
</head>

<body cz-shortcut-listen="true">
    <h2>Track your AWB Number</h2>
    <form method="GET" action="">
        <label for="awb">Enter AWB Number:</label>
        <input type="text" id="awb" name="awb" required="">
        <button type="submit">Track</button>
    </form>
    <h2>Check All AWB Records</h2>
    <form method="GET" action="/all-data" id="get_records_form">
        <button type="submit">View All Records</button>
    </form>
    <div class="upload-csv-container">
        <h2>Upload Bulk Data in CSV Format Only</h2>
        <input type="file" id="csvFile" accept=".csv">
    </div>
    <form id="upload_form">
        <h2>Upload Bulk Data in JSON Format Only</h2>
        <textarea id="records_data_to_upload" name="records_data_to_upload" rows="30" cols="50" required=""></textarea>
    </form>
    <button type="submit" form="upload_form">Upload Bulk Data</button>

    <script>
        document.querySelector('form[action=""]').addEventListener('submit', function (e) {
            e.preventDefault();
            const awb = document.getElementById('awb').value.trim();
            if (awb) {
                window.location.href = '/track/' + encodeURIComponent(awb);
            }
        });

        // Bulk upload form handler for JSON
        document.getElementById('upload_form').addEventListener('submit', async function (e) {
            e.preventDefault();
            const textarea = document.getElementById('records_data_to_upload');
            let records;
            try {
                records = JSON.parse(textarea.value);
            } catch (err) {
                alert('Invalid JSON format!');
                return;
            }
            const res = await fetch('/upload-json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(records)
            });
            const result = await res.json();
            if (!res.ok) {
                alert(result.message || "Upload failed");
                return;
            }

            alert(result.message || "Upload complete");
        });

        // Bulk upload handler for CSV
        document.getElementById('csvFile').addEventListener('change', function (event) {

            const file = event.target.files[0];
            if (!file) return;

            if (
                file.type !== 'text/csv' &&
                !file.name.toLowerCase().endsWith('.csv')
            ) {
                alert('Please upload CSV file only');
                event.target.value = '';
                return;
            }

            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,

                complete: function (results) {

                    const jsonData = results.data;

                    fetch("/upload-csv", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(jsonData)
                    })
                        .then(res => res.json())
                        .then(data => {
                            alert(data.message);
                        })
                        .catch(err => {
                            console.error(err);
                            alert("Upload failed");
                        });

                }
            });

        });
    </script>
</body>
</html>
  `)
});

// API endpoint to get all shipment data
app.get('/all-data', async (req, res) => {
  await connectDB();
  try {
    const shipments = await Shipment.find({});
    res.json(shipments);

  } catch (err) {
    res.status(500).json({
      message: "Error fetching shipments",
      error: err.message
    });
  }
})

// API endpoint to track AWB number
app.get('/track/:awb', async (req, res) => {
  const awbNumber = req.params.awb;
  await connectDB();
  try {
    const shipment = await Shipment.findOne({ awb_no: awbNumber });
    if (!shipment) {
      return res.status(404).json({ message: "AWB not found" });
    }
    res.json(shipment);
  } catch (err) {
    res.status(500).json({
      message: "Error fetching shipment",
      error: err.message
    });
  }
})

//Bulk upload endpoint for JSON data
app.post('/upload-json', async (req, res) => {
  await connectDB();
  try {

    const shipments = req.body;

    if (!Array.isArray(shipments)) {
      return res.status(400).json({
        message: "Data must be an array of shipments"
      });
    }

    for (const row of shipments) {

      await Shipment.updateOne(
        { awb_no: row.awb_no },
        { $set: row },
        { upsert: true }
      );

    }

    res.json({
      message: "Bulk data uploaded successfully",
      inserted: shipments.length
    });

  } catch (err) {

    console.error("UPLOAD JSON ERROR:", err);

    res.status(500).json({
      message: "Error uploading JSON data",
      error: err.message
    });

  }
});

//Upload endpoint for CSV data
app.post('/upload-csv', async (req, res) => {
  await connectDB();
  try {

    const shipments = req.body;

    if (!Array.isArray(shipments)) {
      return res.status(400).json({
        message: "Invalid CSV data"
      });
    }

    const cleanedData = shipments.filter(row => row.awb_no);

    for (const row of cleanedData) {

      await Shipment.updateOne(
        { awb_no: row.awb_no },
        { $set: row },
        { upsert: true }
      );

    }

    res.json({
      message: "CSV processed successfully"
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Database error",
      error: err.message
    });

  }
});

export default app