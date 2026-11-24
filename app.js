const PUBLIC_RELEASES_PAGE = "https://github.com/navimapsios/navimapsios.github.io/releases";
const SIDEINSTALLER_OPEN = "https://sideinstaller.net/open.html?url=";
const IOS_TAG_PATTERN = /^ios-v(\d+)\.(\d+)\.(\d+)$/;
const CACHE_KEY = "navimaps-ios-latest-release-v5";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const releaseVersion = document.getElementById("releaseVersion");
const releaseStatus = document.getElementById("releaseStatus");
const releaseSource = document.getElementById("releaseSource");
const statusDot = document.getElementById("statusDot");
const installButton = document.getElementById("installButton");
const downloadButton = document.getElementById("downloadButton");
const retryButton = document.getElementById("retryButton");

function getCandidate(manifest) {
    if (!manifest || typeof manifest.tag !== "string") {
        throw new Error("Thông tin phiên bản không hợp lệ");
    }

    const match = IOS_TAG_PATTERN.exec(manifest.tag);
    if (!match) {
        throw new Error("Mã phiên bản phát hành không hợp lệ");
    }

    const version = `${match[1]}.${match[2]}.${match[3]}`;
    const downloadUrl = `https://github.com/navimapsios/navimapsios.github.io/releases/download/${manifest.tag}/Navimaps.ipa`;
    if (manifest.version !== version || manifest.download_url !== downloadUrl) {
        throw new Error("Thông tin IPA không khớp với phiên bản phát hành");
    }

    return { version, tag: manifest.tag, downloadUrl };
}

async function fetchLatestRelease() {
    const manifestUrl = new URL("latest-release.json", document.baseURI);
    manifestUrl.searchParams.set("_", Date.now().toString());

    const response = await fetch(manifestUrl, {
        headers: { Accept: "application/json" },
        cache: "no-store"
    });
    if (!response.ok) {
        throw new Error(`Tệp phiên bản trả về HTTP ${response.status}`);
    }

    return getCandidate(await response.json());
}

function readCachedRelease() {
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
        if (!cached || Date.now() - cached.savedAt > CACHE_TTL_MS) {
            return null;
        }
        return getCandidate(cached);
    } catch {
        return null;
    }
}

function saveCachedRelease(candidate) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            savedAt: Date.now(),
            version: candidate.version,
            download_url: candidate.downloadUrl,
            tag: candidate.tag
        }));
    } catch {
        // The page works without local storage.
    }
}

function setButtonLink(element, href) {
    element.href = href;
    element.classList.remove("disabled");
    element.setAttribute("aria-disabled", "false");
}

function showReady(version, downloadUrl, tag, cached = false) {
    const sideInstallerUrl = `${SIDEINSTALLER_OPEN}${encodeURIComponent(downloadUrl)}`;
    releaseVersion.textContent = `v${version}`;
    releaseStatus.textContent = "IPA sẵn sàng để tải và ký lại trên iPhone.";
    releaseSource.textContent = `${cached ? "Dữ liệu lưu tạm" : "Navimaps iOS"} · ${tag}`;
    statusDot.classList.remove("error");
    statusDot.classList.add("ready");
    setButtonLink(downloadButton, downloadUrl);
    setButtonLink(installButton, sideInstallerUrl);
}

function showUnavailable(message) {
    releaseVersion.textContent = "Chưa có IPA công khai";
    releaseStatus.textContent = message;
    releaseSource.innerHTML = `Xem release tại <a href="${PUBLIC_RELEASES_PAGE}" target="_blank" rel="noopener noreferrer">GitHub</a>.`;
    statusDot.classList.remove("ready");
    statusDot.classList.add("error");
}

async function loadLatestRelease({ ignoreCache = false } = {}) {
    retryButton.disabled = true;
    releaseVersion.textContent = "Đang kiểm tra…";
    releaseStatus.textContent = "Đang tìm bản phát hành iOS hợp lệ.";
    releaseSource.textContent = "";
    statusDot.classList.remove("ready", "error");

    if (!ignoreCache) {
        const cached = readCachedRelease();
        if (cached) {
            showReady(cached.version, cached.downloadUrl, cached.tag, true);
        }
    }

    try {
        const candidate = await fetchLatestRelease();
        saveCachedRelease(candidate);
        showReady(candidate.version, candidate.downloadUrl, candidate.tag);
    } catch {
        const cached = readCachedRelease();
        if (cached) {
            showReady(cached.version, cached.downloadUrl, cached.tag, true);
            return;
        }
        showUnavailable("Không tải được thông tin phiên bản. Vui lòng thử lại hoặc mở danh sách bản phát hành trên GitHub.");
    } finally {
        retryButton.disabled = false;
    }
}

retryButton.addEventListener("click", () => {
    localStorage.removeItem(CACHE_KEY);
    loadLatestRelease({ ignoreCache: true });
});

document.querySelectorAll("[data-ios-target]").forEach(button => {
    button.addEventListener("click", () => {
        const targetId = button.dataset.iosTarget;

        document.querySelectorAll("[data-ios-target]").forEach(item => {
            const active = item === button;
            item.classList.toggle("active", active);
            item.setAttribute("aria-selected", String(active));
        });

        document.querySelectorAll(".ios-panel").forEach(panel => {
            const active = panel.id === targetId;
            panel.classList.toggle("active", active);
            panel.hidden = !active;
        });
    });
});

document.querySelectorAll("[data-copy-target]").forEach(button => {
    button.addEventListener("click", async () => {
        const target = document.getElementById(button.dataset.copyTarget);
        if (!target) {
            return;
        }

        const originalText = button.textContent;
        try {
            await navigator.clipboard.writeText(target.textContent.trim());
            button.textContent = "Đã sao chép";
        } catch {
            button.textContent = "Không sao chép được";
        }

        window.setTimeout(() => {
            button.textContent = originalText;
        }, 1800);
    });
});

loadLatestRelease();
