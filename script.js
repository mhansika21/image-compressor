const imageInput = document.querySelector("#imageInput");
const dropZone = document.querySelector("#dropZone");
const targetSizeInput = document.querySelector("#targetSizeInput");
const targetUnitInput = document.querySelector("#targetUnitInput");
const widthInput = document.querySelector("#widthInput");
const formatInput = document.querySelector("#formatInput");
const compressButton = document.querySelector("#compressButton");
const originalPreview = document.querySelector("#originalPreview");
const compressedPreview = document.querySelector("#compressedPreview");
const originalSize = document.querySelector("#originalSize");
const compressedSize = document.querySelector("#compressedSize");
const savingText = document.querySelector("#savingText");
const downloadLink = document.querySelector("#downloadLink");

let selectedFile = null;
let compressedUrl = "";

function formatBytes(bytes) {
  if (!bytes) {
    return "0 KB";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function getExtension(type) {
  if (type === "image/png") {
    return "png";
  }

  if (type === "image/webp") {
    return "webp";
  }

  return "jpg";
}

function getTargetBytes() {
  const fallbackSize = targetUnitInput.value === "MB" ? 1 : 200;
  const size = Math.max(0.01, Number(targetSizeInput.value) || fallbackSize);
  return targetUnitInput.value === "MB"
    ? Math.round(size * 1024 * 1024)
    : Math.round(size * 1024);
}

function setPreview(frameImage, src) {
  frameImage.src = src;
  frameImage.closest(".image-frame").classList.add("has-image");
}

function resetCompressedResult() {
  if (compressedUrl) {
    URL.revokeObjectURL(compressedUrl);
  }

  compressedUrl = "";
  compressedPreview.removeAttribute("src");
  compressedPreview.closest(".image-frame").classList.remove("has-image");
  compressedSize.textContent = "Waiting";
  savingText.textContent = "Savings will show here.";
  downloadLink.removeAttribute("href");
  downloadLink.classList.add("disabled");
}

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    savingText.textContent = "Please choose a JPG, PNG, or WebP image.";
    return;
  }

  selectedFile = file;
  originalSize.textContent = formatBytes(file.size);
  resetCompressedResult();

  const fileUrl = URL.createObjectURL(file);
  setPreview(originalPreview, fileUrl);
  originalPreview.onload = () => URL.revokeObjectURL(fileUrl);
}

function updateTargetDefault() {
  if (targetUnitInput.value === "MB" && Number(targetSizeInput.value) > 20) {
    targetSizeInput.value = "1";
  }

  if (targetUnitInput.value === "KB" && Number(targetSizeInput.value) < 10) {
    targetSizeInput.value = "200";
  }
}

function createImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const imageUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error("Could not read this image."));
    };

    image.src = imageUrl;
  });
}

function canvasToBlob(canvas, type, quality = 0.8) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function drawToCanvas(image, width, height, type) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = width;
  canvas.height = height;

  if (type === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }

  context.drawImage(image, 0, 0, width, height);

  return canvas;
}

async function compressCanvasToTarget(canvas, type, targetBytes) {
  if (type === "image/png") {
    return canvasToBlob(canvas, type);
  }

  let bestBlob = await canvasToBlob(canvas, type, 0.8);
  let low = 0.1;
  let high = 0.95;

  for (let index = 0; index < 8; index += 1) {
    const quality = (low + high) / 2;
    const blob = await canvasToBlob(canvas, type, quality);

    if (!blob) {
      break;
    }

    if (blob.size <= targetBytes) {
      bestBlob = blob;
      low = quality;
    } else {
      high = quality;
    }
  }

  return bestBlob;
}

async function compressImageToTarget(image, type, startWidth, startHeight, targetBytes) {
  let width = startWidth;
  let height = startHeight;
  let bestBlob = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = drawToCanvas(image, width, height, type);
    const blob = await compressCanvasToTarget(canvas, type, targetBytes);

    if (!blob) {
      break;
    }

    bestBlob = blob;

    if (blob.size <= targetBytes || width <= 220 || height <= 220) {
      break;
    }

    width = Math.max(220, Math.round(width * 0.82));
    height = Math.max(220, Math.round(height * 0.82));
  }

  return bestBlob;
}

async function compressImage() {
  if (!selectedFile) {
    savingText.textContent = "Please choose an image first.";
    return;
  }

  compressButton.disabled = true;
  compressButton.textContent = "Compressing...";

  try {
    const image = await createImage(selectedFile);
    const maxWidth = Math.max(100, Number(widthInput.value) || image.naturalWidth);
    const ratio = Math.min(1, maxWidth / image.naturalWidth);
    const width = Math.round(image.naturalWidth * ratio);
    const height = Math.round(image.naturalHeight * ratio);
    const outputType = formatInput.value;
    const targetBytes = getTargetBytes();

    const blob = await compressImageToTarget(image, outputType, width, height, targetBytes);
    if (!blob) {
      throw new Error("Compression failed.");
    }

    if (compressedUrl) {
      URL.revokeObjectURL(compressedUrl);
    }

    compressedUrl = URL.createObjectURL(blob);
    setPreview(compressedPreview, compressedUrl);
    compressedSize.textContent = formatBytes(blob.size);

    const savedPercent = Math.max(0, Math.round((1 - blob.size / selectedFile.size) * 100));
    savingText.textContent = blob.size < selectedFile.size
      ? `Reduced by ${savedPercent}% and kept under ${formatBytes(targetBytes)}`
      : "This setting did not reduce the image size.";

    const baseName = selectedFile.name.replace(/\.[^.]+$/, "");
    downloadLink.href = compressedUrl;
    downloadLink.download = `${baseName}-compressed.${getExtension(outputType)}`;
    downloadLink.classList.remove("disabled");
  } catch (error) {
    savingText.textContent = error.message;
  } finally {
    compressButton.disabled = false;
    compressButton.textContent = "Compress Image";
  }
}

imageInput.addEventListener("change", () => {
  loadFile(imageInput.files[0]);
});

targetUnitInput.addEventListener("change", updateTargetDefault);

compressButton.addEventListener("click", compressImage);

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  loadFile(event.dataTransfer.files[0]);
});
