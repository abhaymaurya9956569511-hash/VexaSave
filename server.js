const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001;

// ==========================================
// PROGRAM PATHS
// ==========================================

const YTDLP =
    "C:\\Users\\HP\\AppData\\Local\\Microsoft\\WinGet\\Packages\\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\\yt-dlp.exe";

const FFMPEG = "ffmpeg";

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

// ==========================================
// HOME
// ==========================================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// ==========================================
// STATUS
// ==========================================

app.get("/status", (req, res) => {
    res.json({
        success: true,
        message: "VexaSave backend is running"
    });
});

// ==========================================
// ANALYZE
// ==========================================

app.post("/analyze", (req, res) => {

    const url = req.body.url;

    if (!url || !url.trim()) {
        return res.status(400).json({
            success: false,
            message: "URL missing"
        });
    }

    console.log("");
    console.log("================================");
    console.log("ANALYZE REQUEST");
    console.log("URL:", url.trim());
    console.log("================================");

    res.json({
        success: true,
        message: "URL received successfully",
        url: url.trim()
    });
});

// ==========================================
// DOWNLOAD
// ==========================================

app.get("/download", (req, res) => {

    const url = req.query.url;
    const quality = String(req.query.quality || "720");

    if (!url || !url.trim()) {
        return res.status(400).send("URL missing");
    }

    // ======================================
    // QUALITY
    // ======================================

    const qualityMap = {
        "360": 360,
        "480": 480,
        "720": 720,
        "1080": 1080
    };

    const height = qualityMap[quality] || 720;

    console.log("");
    console.log("==========================================");
    console.log("           VEXASAVE DOWNLOAD");
    console.log("==========================================");
    console.log("URL:", url.trim());
    console.log("QUALITY:", height + "p");
    console.log("==========================================");

    // ======================================
    // CHECK YT-DLP
    // ======================================

    if (!fs.existsSync(YTDLP)) {

        console.error("yt-dlp not found:");
        console.error(YTDLP);

        return res.status(500).send(
            "yt-dlp nahi mila.\n\n" +
            YTDLP
        );
    }

    // ======================================
    // DOWNLOAD FOLDER
    // ======================================

    const downloadFolder = path.join(
        __dirname,
        "downloads"
    );

    if (!fs.existsSync(downloadFolder)) {
        fs.mkdirSync(downloadFolder, {
            recursive: true
        });
    }

    // ======================================
    // UNIQUE FILE ID
    // ======================================

    const fileId =
        "vexasave-" +
        Date.now() +
        "-" +
        Math.random()
            .toString(36)
            .substring(2, 8);

    const outputTemplate = path.join(
        downloadFolder,
        fileId + ".%(ext)s"
    );

    // ======================================
    // FORMAT
    //
    // Don't force Instagram to use a
    // specific audio format.
    //
    // yt-dlp will choose an available
    // format and FFmpeg will only merge
    // separate streams when necessary.
    // ======================================

    const format =
        "bestvideo[height<=" +
        height +
        "]+bestaudio/" +
        "best[height<=" +
        height +
        "]/best";

    const args = [

        "--no-playlist",

        "--newline",

        "--no-warnings",

        // Faster fragment downloading
        "--concurrent-fragments",
        "8",

        // Retry
        "--retries",
        "3",

        "--fragment-retries",
        "3",

        // Timeout
        "--socket-timeout",
        "20",

        // Format
        "-f",
        format,

        // Merge only when necessary.
        // No video re-encoding.
        "--merge-output-format",
        "mp4",

        // Output
        "-o",
        outputTemplate,

        // URL
        url.trim()
    ];

    console.log("");
    console.log("Starting yt-dlp...");
    console.log("Format:", format);
    console.log("Fast mode enabled");
    console.log("No video re-encoding");
    console.log("");

    // ======================================
    // START YT-DLP
    // ======================================

    const downloader = spawn(
        YTDLP,
        args,
        {
            windowsHide: true
        }
    );

    let stdoutData = "";
    let stderrData = "";

    // ======================================
    // STDOUT
    // ======================================

    downloader.stdout.on("data", (data) => {

        const text = data.toString();

        stdoutData += text;

        console.log(
            "[yt-dlp]",
            text.trim()
        );
    });

    // ======================================
    // STDERR
    // ======================================

    downloader.stderr.on("data", (data) => {

        const text = data.toString();

        stderrData += text;

        console.log(
            "[yt-dlp]",
            text.trim()
        );
    });

    // ======================================
    // PROCESS ERROR
    // ======================================

    downloader.on("error", (error) => {

        console.error(
            "yt-dlp process error:",
            error
        );

        if (!res.headersSent) {

            res.status(500).send(
                "yt-dlp start nahi ho paya.\n\n" +
                error.message
            );
        }
    });

    // ======================================
    // DOWNLOAD FINISHED
    // ======================================

    downloader.on("close", (code) => {

        console.log("");
        console.log(
            "yt-dlp finished. Exit code:",
            code
        );

        // ==================================
        // FAILED
        // ==================================

        if (code !== 0) {

            console.error("");
            console.error(
                "========== YT-DLP ERROR =========="
            );

            console.error(
                stderrData ||
                stdoutData ||
                "Unknown yt-dlp error"
            );

            console.error(
                "=================================="
            );

            if (!res.headersSent) {

                res.status(500).send(
                    "Download failed.\n\n" +
                    (
                        stderrData ||
                        stdoutData ||
                        "Unknown yt-dlp error"
                    )
                );
            }

            return;
        }

        // ==================================
        // FIND DOWNLOADED FILE
        // ==================================

        let files = [];

        try {

            files = fs
                .readdirSync(downloadFolder)
                .filter((file) => {

                    return file.startsWith(
                        fileId + "."
                    );
                });

        } catch (error) {

            console.error(
                "Folder read error:",
                error
            );
        }

        if (files.length === 0) {

            console.error(
                "Downloaded file not found."
            );

            if (!res.headersSent) {

                res.status(500).send(
                    "Download hua lekin file nahi mili."
                );
            }

            return;
        }

        // ==================================
        // PREFER MP4
        // ==================================

        let selectedFile =
            files.find((file) =>
                file.toLowerCase().endsWith(".mp4")
            );

        // If MP4 isn't available, use whatever
        // yt-dlp produced.
        if (!selectedFile) {
            selectedFile = files[0];
        }

        const finalFile = path.join(
            downloadFolder,
            selectedFile
        );

        console.log("");
        console.log(
            "Downloaded file:",
            finalFile
        );

        // ==================================
        // FILE CHECK
        // ==================================

        if (!fs.existsSync(finalFile)) {

            if (!res.headersSent) {

                res.status(500).send(
                    "Downloaded file nahi mili."
                );
            }

            return;
        }

        const stats = fs.statSync(finalFile);

        console.log(
            "File size:",
            stats.size,
            "bytes"
        );

        if (stats.size <= 0) {

            try {
                fs.unlinkSync(finalFile);
            } catch (e) {}

            if (!res.headersSent) {

                res.status(500).send(
                    "Downloaded file empty hai."
                );
            }

            return;
        }

        // ==================================
        // SEND TO USER
        // ==================================

        console.log("");
        console.log(
            "Sending file to browser..."
        );

        res.download(
            finalFile,
            "VexaSave-" + quality + "p.mp4",
            (error) => {

                if (error) {

                    console.error(
                        "Browser download error:",
                        error.message
                    );

                } else {

                    console.log(
                        "Download sent successfully."
                    );
                }

                // ==================================
                // DELETE TEMP FILE
                // ==================================

                fs.unlink(
                    finalFile,
                    (deleteError) => {

                        if (deleteError) {

                            console.error(
                                "Temporary file delete error:",
                                deleteError.message
                            );

                        } else {

                            console.log(
                                "Temporary file deleted."
                            );
                        }
                    }
                );
            }
        );
    });
});

// ==========================================
// 404
// ==========================================

app.use((req, res) => {

    res.status(404).send(
        "VexaSave: Page not found"
    );
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {

    console.log("");
    console.log(
        "======================================"
    );
    console.log(
        "          VEXASAVE BACKEND"
    );
    console.log(
        "======================================"
    );
    console.log(
        "Server:",
        "http://localhost:" + PORT
    );
    console.log(
        "Status:",
        "http://localhost:" + PORT + "/status"
    );
    console.log(
        "======================================"
    );
    console.log("");
});