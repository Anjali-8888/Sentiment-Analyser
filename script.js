let posts = [];
let sentimentCounts = {
    positive: 0,
    neutral: 0,
    negative: 0
};
let chart;
let postsPerPage = 5;
let currentPage = 1;

// Load API key from local storage or fallback to the default key
const DEFAULT_KEY = "YOUR_GEMINI_API_KEY";
let geminiKey = localStorage.getItem('sentiPulseApiKey') || DEFAULT_KEY;

// If the stored key is the old leaked key, clean it up and use the default key
if (geminiKey === "AIzaSyCvW6CrMeVSbfRvhDTEle4U5wtZDKQ6Y3A") {
    localStorage.removeItem('sentiPulseApiKey');
    geminiKey = DEFAULT_KEY;
}

window.onload = function () {
    loadFromLocalStorage();
    initChart();
    initTrendChart();
    updateMetrics();
    renderPosts();
    updateChart();
    updateTrendChart();
    updateChartThemes(currentTheme);
};

function saveToLocalStorage() {
    localStorage.setItem('nexusPosts', JSON.stringify(posts));
}

function loadFromLocalStorage() {
    const saved = localStorage.getItem('nexusPosts');
    if (saved) {
        try {
            posts = JSON.parse(saved);
            sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
            posts.forEach(p => {
                if (sentimentCounts[p.sentiment] !== undefined) {
                    sentimentCounts[p.sentiment]++;
                }
            });
        } catch (e) {
            console.error("Local storage parse error", e);
        }
    }
}

function clearHistory() {
    if (posts.length === 0) return;
    if (confirm("Are you sure you want to clear all analysis history?")) {
        posts = [];
        sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
        saveToLocalStorage();
        updateMetrics();
        renderPosts();
        updateChart();
        updateTrendChart();
        if (reportsView && !reportsView.classList.contains('hidden')) {
            generateReport();
        }
        showToast("History cleared successfully", "success");
    }
}

// Toast Notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-xmark';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Analyse
async function analyzePost() {
    const input = document.getElementById('input');
    const btnText = document.querySelector('.btn-text');
    const spinner = document.querySelector('.loading-spinner');
    const analyzeBtn = document.getElementById('analyzeBtn');

    const text = input.value.trim();

    if (!text) {
        showToast('Please enter some text to analyze', 'error');
        return;
    }

    if (!geminiKey || geminiKey === 'YOUR_NEW_API_KEY_HERE' || geminiKey === 'YOUR_GEMINI_API_KEY') {
        showToast('Please set a valid API key in Settings', 'error');
        openSettingsModal();
        return;
    }

    try {
        // UI Loading State
        input.disabled = true;
        analyzeBtn.disabled = true;
        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');
        showSkeleton();

        const result = await analyzeSentimentWithGemini(text);

        const skeleton = document.getElementById('postSkeleton');
        if (skeleton) {
            skeleton.remove();
        }

        addPost(text, result);

        input.value = '';
        showToast('Analysis complete!', 'success');

    } catch (error) {
        console.error('Error analyzing sentiment:', error);
        const errorMsg = error.message || '';
        if (errorMsg.includes('HTTP 403') || errorMsg.includes('HTTP 404') || errorMsg.includes('API request failed')) {
            showToast('API request failed. Please check your API key in Settings.', 'error');
            setTimeout(openSettingsModal, 1000);
        } else {
            showToast(`Error: ${errorMsg || 'Failed to analyze sentiment.'}`, 'error');
        }
    } finally {
        // Restore UI
        input.disabled = false;
        analyzeBtn.disabled = false;
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
        const skeleton = document.getElementById('postSkeleton');
        if (skeleton) {
            skeleton.remove();
        }
        if (posts.length === 0) {
            renderPosts();
        }
        input.focus();
    }
}

// Enter keydown
document.getElementById('input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        analyzePost();
    }
});

// Prompt to gemini
async function analyzeSentimentWithGemini(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

    const geminiPrompt = `Analyze the sentiment of the following text. You MUST respond with ONLY valid JSON and nothing else. Do not use markdown code blocks.
Strict JSON format required:
{
  "sentiment": "positive" or "neutral" or "negative",
  "confidence": <integer from 0 to 100 representing certainty>,
  "emotion": "<single lowercase word for the dominant emotion>",
  "key_phrase": "<a short 2-5 word snippet that best highlights the emotion>"
}
Text to analyze: "${text}"`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: geminiPrompt }]
            }]
        })
    });

    if (!response.ok) {
        throw new Error(`API request failed: HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error('Invalid API response');
    }

    let jsonStr = data.candidates[0].content.parts[0].text.trim();

    // Clean up potential markdown JSON formatting
    jsonStr = jsonStr.replace(/^```json\n?/g, '').replace(/\n?```$/g, '').trim();

    try {
        const parsed = JSON.parse(jsonStr);
        // Normalize sentiment
        let sentiment = parsed.sentiment.toLowerCase();
        if (!['positive', 'neutral', 'negative'].includes(sentiment)) {
            sentiment = 'neutral';
        }

        return {
            sentiment: sentiment,
            confidence: Number(parsed.confidence) || 0,
            emotion: parsed.emotion || 'unknown',
            keyPhrase: parsed.key_phrase || ''
        };
    } catch (e) {
        console.error("JSON Parsing failed from AI:", jsonStr);
        throw new Error("Failed to parse AI response");
    }
}

// Add to recent
function addPost(text, result) {
    const post = {
        text,
        sentiment: result.sentiment,
        confidence: result.confidence,
        emotion: result.emotion,
        keyPhrase: result.keyPhrase,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    posts.unshift(post);
    if (sentimentCounts[post.sentiment] !== undefined) {
        sentimentCounts[post.sentiment]++;
    }

    saveToLocalStorage();
    updateMetrics();
    currentPage = 1; // Reset to first page to see new post
    renderPosts();
    updateChart();
    updateTrendChart();
}

function renderPosts() {
    const postsContainer = document.getElementById('postsContainer');
    const historyCount = document.getElementById('historyCount');

    historyCount.textContent = `${posts.length} entries`;

    if (posts.length === 0) {
        postsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-comment-dots"></i>
                <p>No posts analyzed yet. Enter some text above to get started.</p>
            </div>
        `;
        document.getElementById('prevPage').disabled = true;
        document.getElementById('nextPage').disabled = true;
        document.getElementById('pageIndicator').textContent = "Page 1";
        return;
    }

    postsContainer.innerHTML = '';

    const startIndex = (currentPage - 1) * postsPerPage;
    const endIndex = startIndex + postsPerPage;
    const paginatedPosts = posts.slice(startIndex, endIndex);

    paginatedPosts.forEach((post, i) => {
        const postElement = document.createElement('div');
        postElement.className = 'post';
        // Add slightly cascaded animation delay
        postElement.style.animationDelay = `${i * 0.1}s`;

        // Emotion Icon Mapping
        let emoIcon = 'fa-face-meh';
        if (post.sentiment === 'positive') emoIcon = 'fa-face-smile-beam';
        if (post.sentiment === 'negative') emoIcon = 'fa-face-angry';

        postElement.innerHTML = `
            <div class="post-header">
                <span class="post-time"><i class="fa-regular fa-clock"></i> ${post.timestamp}</span>
                <span class="sentiment-badge ${post.sentiment}">
                    <i class="fa-solid ${emoIcon}"></i> ${post.sentiment}
                </span>
            </div>
            <div class="post-content">${escapeHtml(post.text)}</div>
            <div class="post-footer">
                <span class="tag" title="Confidence Score">
                    <i class="fa-solid fa-bullseye"></i> <strong>${post.confidence}%</strong>
                </span>
                <span class="tag" title="Primary Emotion">
                    <i class="fa-solid fa-masks-theater"></i> <strong style="text-transform: capitalize;">${post.emotion}</strong>
                </span>
                <span class="tag key-phrase" title="Key Phrase">
                    <i class="fa-solid fa-quote-left"></i> "${escapeHtml(post.keyPhrase)}"
                </span>
            </div>
        `;
        postsContainer.appendChild(postElement);
    });

    updatePaginationButtons();
}

// Pagination
function updatePaginationButtons() {
    const totalPages = Math.max(1, Math.ceil(posts.length / postsPerPage));
    document.getElementById('pageIndicator').textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById('prevPage').disabled = currentPage <= 1;
    document.getElementById('nextPage').disabled = currentPage >= totalPages;
}

function changePage(direction) {
    currentPage += direction;
    renderPosts();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Charts.js chart
function initChart() {
    const ctx = document.getElementById('sentimentChart').getContext('2d');

    // Register global defaults for light SaaS theme
    Chart.defaults.color = '#475569';
    Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";

    chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Positive', 'Neutral', 'Negative'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: [
                    '#10b981', // Emerald
                    '#f59e0b', // Amber
                    '#ef4444'  // Red
                ],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: '#ffffff',
                    titleColor: '#0f172a',
                    bodyColor: '#475569',
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true,
                    borderColor: '#e2e8f0',
                    borderWidth: 1
                }
            },
            animation: {
                animateScale: true,
                animateRotate: true
            }
        }
    });
}

function updateChart() {
    if (!chart) return;
    chart.data.datasets[0].data = [
        sentimentCounts.positive,
        sentimentCounts.neutral,
        sentimentCounts.negative
    ];
    chart.update();
}

// Overview metrics
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);

        let val;
        // Check if value should be percentage
        if (typeof end === 'string' && end.includes('%')) {
            val = Math.floor(progress * (parseInt(end) - start)) + start + '%';
        } else {
            val = Math.floor(progress * (end - start) + start);
        }

        obj.innerHTML = val;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function updateMetrics() {
    const total = posts.length;
    const positive = posts.filter(p => p.sentiment === 'positive').length;
    const negative = posts.filter(p => p.sentiment === 'negative').length;
    const neutral = posts.filter(p => p.sentiment === 'neutral').length;

    const elements = {
        total: document.getElementById('totalPosts'),
        pos: document.getElementById('positivePercentage'),
        neg: document.getElementById('negativePercentage'),
        neu: document.getElementById('neutralPercentage')
    };

    const targetPos = total ? Math.round((positive / total) * 100) + '%' : '0%';
    const targetNeg = total ? Math.round((negative / total) * 100) + '%' : '0%';
    const targetNeu = total ? Math.round((neutral / total) * 100) + '%' : '0%';

    // Update progress bars
    const barPos = document.getElementById('barPos');
    const barNeg = document.getElementById('barNeg');
    const barNeu = document.getElementById('barNeu');

    if (barPos) barPos.style.width = targetPos;
    if (barNeg) barNeg.style.width = targetNeg;
    if (barNeu) barNeu.style.width = targetNeu;

    // Animate the counters
    animateValue(elements.total, parseInt(elements.total.innerText) || 0, total, 1000);
    animateValue(elements.pos, parseInt(elements.pos.innerText) || 0, targetPos, 1000);
    animateValue(elements.neg, parseInt(elements.neg.innerText) || 0, targetNeg, 1000);
    animateValue(elements.neu, parseInt(elements.neu.innerText) || 0, targetNeu, 1000);
}

// Settings Modal Logic
const settingsModal = document.getElementById('settingsModal');
const settingsBtn = document.getElementById('settingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const toggleKeyVisibility = document.getElementById('toggleKeyVisibility');

if (settingsBtn) {
    settingsBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openSettingsModal();
    });
}

if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', closeSettingsModal);
}

if (cancelSettingsBtn) {
    cancelSettingsBtn.addEventListener('click', closeSettingsModal);
}

if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', function () {
        const newKey = apiKeyInput.value.trim();
        if (newKey && newKey !== "AIzaSyCvW6CrMeVSbfRvhDTEle4U5wtZDKQ6Y3A") {
            localStorage.setItem('sentiPulseApiKey', newKey);
            geminiKey = newKey;
            showToast('API Key saved successfully', 'success');
        } else {
            localStorage.removeItem('sentiPulseApiKey');
            geminiKey = DEFAULT_KEY;
            showToast('API Key cleared. Using default key.', 'info');
        }
        closeSettingsModal();
    });
}

if (toggleKeyVisibility) {
    toggleKeyVisibility.addEventListener('click', function () {
        const icon = toggleKeyVisibility.querySelector('i');
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            icon.className = 'fa-regular fa-eye-slash';
        } else {
            apiKeyInput.type = 'password';
            icon.className = 'fa-regular fa-eye';
        }
    });
}

function openSettingsModal() {
    if (settingsModal && apiKeyInput) {
        apiKeyInput.value = localStorage.getItem('sentiPulseApiKey') || '';
        settingsModal.classList.remove('hidden');
    }
}

function closeSettingsModal() {
    if (settingsModal) {
        settingsModal.classList.add('hidden');
    }
}

// Close modal if clicked outside
window.addEventListener('click', function (e) {
    if (e.target === settingsModal) {
        closeSettingsModal();
    }
});

// Navigation toggling
const dashboardLink = document.getElementById('dashboardLink');
const reportsLink = document.getElementById('reportsLink');
const dashboardView = document.getElementById('dashboardView');
const reportsView = document.getElementById('reportsView');

if (dashboardLink) {
    dashboardLink.addEventListener('click', function (e) {
        e.preventDefault();
        showView('dashboard');
    });
}

if (reportsLink) {
    reportsLink.addEventListener('click', function (e) {
        e.preventDefault();
        showView('reports');
    });
}

function showView(view) {
    if (view === 'dashboard') {
        if (dashboardView) dashboardView.classList.remove('hidden');
        if (reportsView) reportsView.classList.add('hidden');
        if (dashboardLink) dashboardLink.classList.add('active');
        if (reportsLink) reportsLink.classList.remove('active');
    } else if (view === 'reports') {
        if (dashboardView) dashboardView.classList.add('hidden');
        if (reportsView) reportsView.classList.remove('hidden');
        if (dashboardLink) dashboardLink.classList.remove('active');
        if (reportsLink) reportsLink.classList.add('active');
        generateReport();
    }
}

function generateReport() {
    const repTotal = document.getElementById('repTotal');
    const repAvgConfidence = document.getElementById('repAvgConfidence');
    const repDominantEmotion = document.getElementById('repDominantEmotion');

    const propPos = document.getElementById('propPos');
    const propNeu = document.getElementById('propNeu');
    const propNeg = document.getElementById('propNeg');

    const lblPropPos = document.getElementById('lblPropPos');
    const lblPropNeu = document.getElementById('lblPropNeu');
    const lblPropNeg = document.getElementById('lblPropNeg');

    const repNegCount = document.getElementById('repNegCount');
    const repPosCount = document.getElementById('repPosCount');
    const repNegList = document.getElementById('repNegList');
    const repPosList = document.getElementById('repPosList');
    const reportsTableBody = document.getElementById('reportsTableBody');

    const total = posts.length;
    if (repTotal) repTotal.textContent = total;

    if (total === 0) {
        if (repAvgConfidence) repAvgConfidence.textContent = '0%';
        if (repDominantEmotion) repDominantEmotion.textContent = '-';
        if (propPos) propPos.style.width = '0%';
        if (propNeu) propNeu.style.width = '0%';
        if (propNeg) propNeg.style.width = '0%';
        if (lblPropPos) lblPropPos.textContent = '0%';
        if (lblPropNeu) lblPropNeu.textContent = '0%';
        if (lblPropNeg) lblPropNeg.textContent = '0%';
        if (repNegCount) repNegCount.textContent = '0 Issues';
        if (repPosCount) repPosCount.textContent = '0 Mentions';
        if (repNegList) repNegList.innerHTML = '<div class="empty-highlight-state">No critical feedback to report.</div>';
        if (repPosList) repPosList.innerHTML = '<div class="empty-highlight-state">No positive praise highlights to report yet.</div>';
        if (reportsTableBody) {
            reportsTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">No data available in report</td>
                </tr>
            `;
        }
        return;
    }

    // Calculations
    const positivePosts = posts.filter(p => p.sentiment === 'positive');
    const negativePosts = posts.filter(p => p.sentiment === 'negative');
    const neutralPosts = posts.filter(p => p.sentiment === 'neutral');

    const avgConfidence = Math.round(posts.reduce((sum, p) => sum + (p.confidence || 0), 0) / total);
    if (repAvgConfidence) repAvgConfidence.textContent = `${avgConfidence}%`;

    // Dominant Emotion
    const emotions = {};
    posts.forEach(p => {
        if (p.emotion) {
            emotions[p.emotion] = (emotions[p.emotion] || 0) + 1;
        }
    });
    let dominant = '-';
    let maxCount = 0;
    for (const [emo, count] of Object.entries(emotions)) {
        if (count > maxCount) {
            dominant = emo;
            maxCount = count;
        }
    }
    if (repDominantEmotion) repDominantEmotion.textContent = dominant;

    // Proportions
    let posPct = Math.round((positivePosts.length / total) * 100);
    let negPct = Math.round((negativePosts.length / total) * 100);
    let neuPct = Math.round((neutralPosts.length / total) * 100);

    // Adjust to ensure they sum to exactly 100% and stay non-negative
    const diff = 100 - (posPct + negPct + neuPct);
    if (diff !== 0) {
        if (neutralPosts.length > 0) {
            neuPct += diff;
        } else if (positivePosts.length > 0) {
            posPct += diff;
        } else if (negativePosts.length > 0) {
            negPct += diff;
        }
    }

    if (propPos) propPos.style.width = `${posPct}%`;
    if (propNeu) propNeu.style.width = `${neuPct}%`;
    if (propNeg) propNeg.style.width = `${negPct}%`;

    if (lblPropPos) lblPropPos.textContent = `${posPct}%`;
    if (lblPropNeu) lblPropNeu.textContent = `${neuPct}%`;
    if (lblPropNeg) lblPropNeg.textContent = `${negPct}%`;

    // Populate Critical Feedback List
    if (repNegCount) repNegCount.textContent = `${negativePosts.length} Issues`;
    if (repNegList) {
        if (negativePosts.length === 0) {
            repNegList.innerHTML = '<div class="empty-highlight-state">No critical feedback to report.</div>';
        } else {
            repNegList.innerHTML = '';
            negativePosts.slice(0, 5).forEach(post => {
                const item = document.createElement('div');
                item.className = 'highlight-item';
                item.innerHTML = `
                    <div class="highlight-text">"${escapeHtml(post.text)}"</div>
                    <div class="highlight-meta">
                        <span><i class="fa-solid fa-masks-theater text-red"></i> Emotion: <strong style="text-transform: capitalize;">${escapeHtml(post.emotion)}</strong></span>
                        <span><i class="fa-solid fa-bullseye"></i> ${post.confidence}%</span>
                    </div>
                `;
                repNegList.appendChild(item);
            });
        }
    }

    // Populate Praise Highlights List
    if (repPosCount) repPosCount.textContent = `${positivePosts.length} Mentions`;
    if (repPosList) {
        if (positivePosts.length === 0) {
            repPosList.innerHTML = '<div class="empty-highlight-state">No positive praise highlights to report yet.</div>';
        } else {
            repPosList.innerHTML = '';
            positivePosts.slice(0, 5).forEach(post => {
                const item = document.createElement('div');
                item.className = 'highlight-item';
                item.innerHTML = `
                    <div class="highlight-text">"${escapeHtml(post.text)}"</div>
                    <div class="highlight-meta">
                        <span><i class="fa-solid fa-masks-theater text-green"></i> Emotion: <strong style="text-transform: capitalize;">${escapeHtml(post.emotion)}</strong></span>
                        <span><i class="fa-solid fa-bullseye"></i> ${post.confidence}%</span>
                    </div>
                `;
                repPosList.appendChild(item);
            });
        }
    }

    // Populate Detailed Table
    if (reportsTableBody) {
        reportsTableBody.innerHTML = '';
        posts.forEach(post => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${post.timestamp}</td>
                <td>${escapeHtml(post.text)}</td>
                <td><span class="sentiment-badge ${post.sentiment}">${post.sentiment}</span></td>
                <td><strong>${post.confidence}%</strong></td>
                <td style="text-transform: capitalize;">${escapeHtml(post.emotion)}</td>
                <td class="key-phrase">"${escapeHtml(post.keyPhrase)}"</td>
            `;
            reportsTableBody.appendChild(tr);
        });
    }
}

function exportCSV() {
    if (posts.length === 0) {
        showToast('No feedback data to export', 'error');
        return;
    }

    let csvContent = 'Timestamp,Text,Sentiment,Confidence,Emotion,Key Phrase\n';

    posts.forEach(post => {
        const textEscaped = post.text.replace(/"/g, '""');
        const phraseEscaped = (post.keyPhrase || '').replace(/"/g, '""');
        csvContent += `"${post.timestamp}","${textEscaped}","${post.sentiment}",${post.confidence},"${post.emotion}","${phraseEscaped}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `SentiPulse_Feedback_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Report exported as CSV successfully', 'success');
}

// ==========================================
// Theme Toggling Logic
// ==========================================
const themeToggleBtn = document.getElementById('themeToggleBtn');
let currentTheme = localStorage.getItem('sentiPulseTheme') || 'light';

if (currentTheme === 'dark') {
    document.body.classList.add('dark-theme');
    if (themeToggleBtn) {
        themeToggleBtn.innerHTML = '<i class="fa-regular fa-sun"></i>';
    }
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        if (document.body.classList.contains('dark-theme')) {
            document.body.classList.remove('dark-theme');
            themeToggleBtn.innerHTML = '<i class="fa-regular fa-moon"></i>';
            localStorage.setItem('sentiPulseTheme', 'light');
            currentTheme = 'light';
            updateChartThemes('light');
        } else {
            document.body.classList.add('dark-theme');
            themeToggleBtn.innerHTML = '<i class="fa-regular fa-sun"></i>';
            localStorage.setItem('sentiPulseTheme', 'dark');
            currentTheme = 'dark';
            updateChartThemes('dark');
        }
    });
}

function updateChartThemes(theme) {
    const isDark = theme === 'dark';
    const textColor = isDark ? '#94A3B8' : '#475569';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    Chart.defaults.color = textColor;

    // Update Donut Chart
    if (chart) {
        chart.options.plugins.legend.labels.color = textColor;
        chart.options.plugins.tooltip.backgroundColor = isDark ? '#131926' : '#ffffff';
        chart.options.plugins.tooltip.titleColor = isDark ? '#ffffff' : '#0f172a';
        chart.options.plugins.tooltip.bodyColor = isDark ? '#e2e8f0' : '#475569';
        chart.options.plugins.tooltip.borderColor = isDark ? '#334155' : '#e2e8f0';
        chart.update();
    }

    // Update Trend Chart
    if (trendChart) {
        trendChart.options.scales.x.ticks.color = textColor;
        trendChart.options.scales.x.grid.color = gridColor;
        trendChart.options.scales.y.ticks.color = textColor;
        trendChart.options.scales.y.grid.color = gridColor;
        trendChart.options.plugins.legend.labels.color = textColor;
        trendChart.options.plugins.tooltip.backgroundColor = isDark ? '#131926' : '#ffffff';
        trendChart.options.plugins.tooltip.titleColor = isDark ? '#ffffff' : '#0f172a';
        trendChart.options.plugins.tooltip.bodyColor = isDark ? '#e2e8f0' : '#475569';
        trendChart.options.plugins.tooltip.borderColor = isDark ? '#334155' : '#e2e8f0';
        trendChart.update();
    }
}

// ==========================================
// Sentiment Trend Line Chart
// ==========================================
let trendChart;

function initTrendChart() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#94A3B8' : '#475569';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'SentiPulse Timeline',
                data: [],
                borderColor: '#6366F1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#6366F1',
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: {
                        color: gridColor
                    },
                    ticks: {
                        color: textColor
                    }
                },
                y: {
                    min: -100,
                    max: 100,
                    grid: {
                        color: gridColor
                    },
                    ticks: {
                        color: textColor,
                        callback: function (value) {
                            if (value === 100) return 'Positive';
                            if (value === 0) return 'Neutral';
                            if (value === -100) return 'Negative';
                            return value + '%';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: isDark ? '#131926' : '#ffffff',
                    titleColor: isDark ? '#ffffff' : '#0f172a',
                    bodyColor: isDark ? '#e2e8f0' : '#475569',
                    borderColor: isDark ? '#334155' : '#e2e8f0',
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            const val = context.raw;
                            if (val > 0) return `Positive (${val}%)`;
                            if (val < 0) return `Negative (${Math.abs(val)}%)`;
                            return 'Neutral';
                        }
                    }
                }
            }
        }
    });
}

function updateTrendChart() {
    if (!trendChart) return;

    // Get the last 10 posts in chronological order (oldest to newest)
    const last10 = posts.slice(0, 10).reverse();

    const labels = last10.map(p => p.timestamp);
    const data = last10.map(p => {
        if (p.sentiment === 'positive') return p.confidence || 0;
        if (p.sentiment === 'negative') return -(p.confidence || 0);
        return 0; // neutral is 0
    });

    trendChart.data.labels = labels;
    trendChart.data.datasets[0].data = data;

    // Adjust gradient color
    const ctx = document.getElementById('trendChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    const isDark = document.body.classList.contains('dark-theme');
    if (isDark) {
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');
    } else {
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');
    }
    trendChart.data.datasets[0].backgroundColor = gradient;

    trendChart.update();
}

// ==========================================
// Skeleton Loader Screen
// ==========================================
function showSkeleton() {
    const postsContainer = document.getElementById('postsContainer');

    // Check if empty-state is present, remove it temporarily
    const emptyState = postsContainer.querySelector('.empty-state');
    if (emptyState) {
        postsContainer.innerHTML = '';
    }

    const skeletonHTML = `
        <div class="skeleton-card" id="postSkeleton">
            <div class="skeleton-header">
                <div class="skeleton-line header-time"></div>
                <div class="skeleton-line header-badge"></div>
            </div>
            <div class="skeleton-line text-1"></div>
            <div class="skeleton-line text-2"></div>
            <div class="skeleton-footer">
                <div class="skeleton-line footer-tag"></div>
                <div class="skeleton-line footer-tag"></div>
                <div class="skeleton-line footer-phrase"></div>
            </div>
        </div>
    `;
    postsContainer.insertAdjacentHTML('afterbegin', skeletonHTML);
}

