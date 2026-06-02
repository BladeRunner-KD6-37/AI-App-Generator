import cors from "cors";

// ...

const rawFrontend =
  process.env.FRONTEND_URL ||
  "https://ai-app-generator-n7bhh04ec-highoncaffienes-projects.vercel.app,http://localhost:3000";

const allowedOrigins = rawFrontend
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow Postman, server-to-server requests, health checks, etc.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error(`[CORS] Blocked origin: ${origin}`);
      console.error(
        `[CORS] Allowed origins: ${allowedOrigins.join(", ")}`
      );

      return callback(
        new Error(`Origin ${origin} not allowed by CORS`)
      );
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
    ],
  })
);

// Handle preflight requests
app.options(/.*/, cors());

// ...