const PUBLIC_RELEASES_API = "https://api.github.com/repos/navimapsios/navimapsios.github.io/releases";
const PUBLIC_RELEASES_PAGE = "https://github.com/navimapsios/navimapsios.github.io/releases";
const SIDEINSTALLER_OPEN = "https://sideinstaller.net/open.html?url=";
const IOS_TAG_PATTERN = /^ios-v(\d+)\.(\d+)\.(\d+)$/;
const IPA_ASSET_NAME = "Navimaps.ipa";
const CACHE_KEY = "navimaps-ios-latest-release-v3";
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_PAGES = 10;

const releaseVersion = document.getElementById("releaseVersion");
const releaseStatus = document.getElementById("releaseStatus");
const releaseSource = document.getElementById("releaseSource");
const statusDot = document.getElementById("statusDot");
const installButton = document.getElementById("installButton");
const downloadButton = document.getElementById("downloadButton");
const retryButton = document.getElementById("retryButton");

function compareVersions(a, b) {
    const buildTimestamp = candidate => Math.max(
        new Date(candidate.release.updated_at || 0).getTime() || 0,
        new Date(candidate.asset.updated_at || 0).getTime() || 0,
        new Date(candidate.release.published_at || 0).getTime() || 0,
        new Date(candidate.release.created_at || 0).getTime() || 0
    );
    const buildTimeDifference = buildTimestamp(b) - buildTimestamp(a);
    if (buildTimeDifference !== 0) {
        return buildTimeDifference;
    }

    // If timestamps match, use the semantic version as a deterministic tie-breaker.
    for (let index = 0; index < 3; index += 1) {
        if (a.versionParts[index] !== b.versionParts[index]) {
            return b.versionParts[index] - a.versionParts[index];
        }
    }
    return 0;
}

function getCandidate(release) {
    if (!release || release.draft || release.prerelease || typeof release.tag_name !== "string") {
        return null;
    }
    const match = IOS_TAG_PATTERN.exec(release.tag_name);
    if (!match) {
        return null;
    }
    const asset = (release.assets || []).find(item => item && item.name === IPA_ASSET_NAME && item.browser_download_url);
    if (!asset) {
        return null;
    }
    return {
        release,
        asset,
        version: `${match[1]}.${match[2]}.${match[3]}`,
        versionParts: [Number(match[1]), Number(match[2]), Number(match[3])]
    };
}

async function fetchReleasePages() {
    const candidates = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
        const response = await fetch(`${PUBLIC_RELEASES_API}?per_page=100&page=${page}`, {
            headers: { Accept: "application/vnd.github+json" },
            cache: "no-store"
        });
        if (!response.ok) {
            throw new Error(`GitHub API ${response.status}`);
        }
        const releases = await response.json();
        if (!Array.isArray(releases)) {
            throw new Error("GitHub API returned an unexpected response");
        }
        for (const release of releases) {
            const candidate = getCandidate(release);
            if (candidate) {
                candidates.push(candidate);
            }
        }
        if (releases.length < 100) {
            break;
        }
    }
    candidates.sort(compareVersions);
    return candidates[0] || null;
}

function readCachedRelease() {
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
        if (!cached || Date.now() - cached.savedAt > CACHE_TTL_MS) {
            return null;
        }
        return cached;
    } catch {
        return null;
    }
}

function saveCachedRelease(candidate) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            savedAt: Date.now(),
            version: candidate.version,
            downloadUrl: candidate.asset.browser_download_url,
            tag: candidate.release.tag_name
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
        const candidate = await fetchReleasePages();
        if (!candidate) {
            showUnavailable("Chưa tìm thấy release ios-vX.Y.Z có asset Navimaps.ipa.");
            return;
        }
        saveCachedRelease(candidate);
        showReady(candidate.version, candidate.asset.browser_download_url, candidate.release.tag_name);
    } catch {
        const cached = readCachedRelease();
        if (cached) {
            showReady(cached.version, cached.downloadUrl, cached.tag, true);
            return;
        }
        showUnavailable("Không đọc được GitHub Releases. Có thể API đang giới hạn, mạng lỗi hoặc IPA chưa được phát hành.");
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
