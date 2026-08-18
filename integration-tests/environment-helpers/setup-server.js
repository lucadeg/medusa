const path = require("path")
const crypto = require("crypto")
const { spawn } = require("child_process")
const { setPort, useExpressServer } = require("./use-api")
const { setContainer } = require("./use-container")

module.exports = async ({ cwd, redisUrl, uploadDir, verbose, env }) => {
  if (!redisUrl) {
    throw new Error("A real Redis URL is required for integration tests")
  }
  const serverPath = path.join(__dirname, "test-server.js")

  // in order to prevent conflicts in redis, use a different db for each worker
  // same fix as for databases (works with up to 15)
  // redis dbs are 0-indexed and jest worker ids are indexed from 1
  const workerId = parseInt(process.env.JEST_WORKER_ID || "1")
  const redisUrlWithDatabase = `${redisUrl}/${workerId - 1}`

  verbose = verbose ?? false

  return await new Promise((resolve, reject) => {
    const medusaProcess = spawn("node", [path.resolve(serverPath)], {
      cwd,
      env: {
        ...process.env,
        NODE_ENV: "development",
        JWT_SECRET: crypto.randomBytes(48).toString("base64url"),
        COOKIE_SECRET: crypto.randomBytes(48).toString("base64url"),
        REDIS_URL: redisUrlWithDatabase,
        UPLOAD_DIR: uploadDir,
        ...env,
      },
      stdio: verbose
        ? ["inherit", "inherit", "inherit", "ipc"]
        : ["ignore", "ignore", "ignore", "ipc"],
    })

    medusaProcess.on("error", (err) => {
      console.log(err)
      reject(err)
      process.exit()
    })

    medusaProcess.on("uncaughtException", (err) => {
      console.log(err)
      reject(err)
      medusaProcess.kill()
    })

    medusaProcess.on("message", (port) => {
      setPort(port)
      resolve(medusaProcess)
    })

    medusaProcess.on("exit", () => {
      const expressServer = useExpressServer()

      setContainer(null)

      if (expressServer) {
        expressServer.close()
      }
    })
  })
}
