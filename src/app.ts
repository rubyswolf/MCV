type McvOperation = "cv.opencvTest";

type McvRequest<TArgs = Record<string, unknown>> = {
  op: McvOperation;
  args: TArgs;
};

type McvSuccess<TData> = {
  ok: true;
  data: TData;
};

type McvFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type McvResponse<TData> = McvSuccess<TData> | McvFailure;

type McvOpencvTestResult = {
  opencv_version: string;
  gray_values: number[];
  shape: number[];
  mean_gray: number;
};

declare const __MCV_BACKEND__: "python" | "web";
declare const __MCV_OPENCV_URL__: string;

let cvPromise: Promise<unknown> | null = null;

function isThenable(value: unknown): value is Promise<unknown> {
  return typeof value === "object" && value !== null && "then" in value;
}

function loadScriptOnce(scriptUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-mcv-src="${scriptUrl}"]`) as
      | HTMLScriptElement
      | null;
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${scriptUrl}`)), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.dataset.mcvSrc = scriptUrl;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "1";
        resolve();
      },
      { once: true }
    );
    script.addEventListener("error", () => reject(new Error(`Failed to load ${scriptUrl}`)), {
      once: true,
    });
    document.head.appendChild(script);
  });
}

async function getWebMcvRuntime(): Promise<any> {
  if (!cvPromise) {
    cvPromise = (async () => {
      const maybeGlobalCv = (globalThis as any).cv;
      if (!maybeGlobalCv) {
        await loadScriptOnce(__MCV_OPENCV_URL__);
      }
      const cvCandidate = (globalThis as any).cv;
      if (!cvCandidate) {
        throw new Error("opencv.js runtime not found on window.cv");
      }
      if (typeof cvCandidate === "function") {
        return await cvCandidate();
      }
      if (isThenable(cvCandidate)) {
        return await cvCandidate;
      }
      return cvCandidate;
    })();
  }
  return cvPromise;
}

async function callMcvApi<TData>(requestBody: McvRequest): Promise<McvResponse<TData>> {
  if (__MCV_BACKEND__ === "web") {
    if (requestBody.op !== "cv.opencvTest") {
      return {
        ok: false,
        error: {
          code: "UNKNOWN_OP",
          message: `Unsupported operation in web backend: ${requestBody.op}`,
        },
      };
    }

    try {
      const cv = await getWebMcvRuntime();
      const src = cv.matFromArray(1, 3, cv.CV_8UC3, [255, 0, 0, 0, 255, 0, 0, 0, 255]);
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGB2GRAY);
      const grayValues = Array.from(gray.data as Uint8Array).map((value) => Number(value));
      const response = {
        ok: true,
        data: {
          opencv_version: String((cv as any).VERSION ?? "opencv.js"),
          gray_values: grayValues,
          shape: [Number(gray.rows), Number(gray.cols)],
          mean_gray:
            grayValues.length > 0
              ? grayValues.reduce((sum, value) => sum + value, 0) / grayValues.length
              : 0,
        },
      } satisfies McvSuccess<McvOpencvTestResult>;
      src.delete();
      gray.delete();
      return response as McvResponse<TData>;
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "WEB_BACKEND_ERROR",
          message: "OpenCV.js call failed",
          details: String(error),
        },
      };
    }
  }

  try {
    const response = await fetch("/api/mcv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: "HTTP_ERROR",
          message: `HTTP ${response.status}`,
        },
      };
    }

    return (await response.json()) as McvResponse<TData>;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: "Could not reach backend API",
        details: String(error),
      },
    };
  }
}

function setStatus(message: string): void {
  const statusNode = document.getElementById("status");
  if (statusNode) {
    statusNode.textContent = message;
  }
}

function setOutput(message: string): void {
  const outputNode = document.getElementById("output");
  if (outputNode) {
    outputNode.textContent = message;
  }
}

async function checkHealth(): Promise<void> {
  if (__MCV_BACKEND__ === "web") {
    try {
      const cv = await getWebMcvRuntime();
      setStatus(`Connected to web backend (opencv.js ${String((cv as any).VERSION ?? "ready")})`);
      return;
    } catch (error) {
      setStatus(`Web backend init failed: ${String(error)}`);
      return;
    }
  }

  try {
    const response = await fetch("/api/mcv/health");
    if (!response.ok) {
      setStatus(`Backend health check failed: HTTP ${response.status}`);
      return;
    }
    const payload = (await response.json()) as { ok: boolean; backend?: string };
    if (!payload.ok) {
      setStatus("Backend health check failed");
      return;
    }
    setStatus(`Connected to backend (${payload.backend ?? "unknown"})`);
  } catch {
    setStatus("Could not connect to backend");
  }
}

async function handleTestButtonClick(): Promise<void> {
  const button = document.getElementById("test-button") as HTMLButtonElement | null;
  if (!button) {
    return;
  }

  button.disabled = true;
  setStatus("Running OpenCV test...");

  const result = await callMcvApi<McvOpencvTestResult>({
    op: "cv.opencvTest",
    args: {},
  });

  if (result.ok) {
    setStatus(`OpenCV call succeeded (version ${result.data.opencv_version})`);
    setOutput(JSON.stringify(result.data, null, 2));
  } else {
    setStatus(`OpenCV call failed: ${result.error.code}`);
    setOutput(JSON.stringify(result.error, null, 2));
  }

  button.disabled = false;
}

function installUiHandlers(): void {
  const button = document.getElementById("test-button");
  if (button) {
    button.addEventListener("click", () => {
      void handleTestButtonClick();
    });
  }
}

function bootstrap(): void {
  installUiHandlers();
  void checkHealth();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
