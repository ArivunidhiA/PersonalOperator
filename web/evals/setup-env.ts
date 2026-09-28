import { config } from "dotenv";
import path from "path";

// Load keys before any lib module reads process.env at import time.
config({ path: path.resolve(__dirname, "../.env.local") });
config({ path: path.resolve(__dirname, "../.env") });
