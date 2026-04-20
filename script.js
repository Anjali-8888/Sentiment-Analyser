let posts = [];
let sentimentCounts = {
    positive: 0,
    neutral: 0,
    negative: 0
};
let chart;
let postsPerPage = 5;
let currentPage = 1;

// Replace with your valid API key (the previous one was reported leaked)
const geminiKey = "AIzaSyCvW6CrMeVSbfRvhDTEle4U5wtZDKQ6Y3A";

window.onload = function () {
    loadFromLocalStorage();
    initChart();
    updateMetrics();
    renderPosts();
    updateChart();
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

    if (geminiKey === 'YOUR_NEW_API_KEY_HERE' || !geminiKey) {
        showToast('Please set a valid API key in script.js', 'error');
        return;
    }

    try {
        // UI Loading State
        input.disabled = true;
        analyzeBtn.disabled = true;
        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');

        const result = await analyzeSentimentWithGemini(text);
        addPost(text, result);

        input.value = '';
        showToast('Analysis complete!', 'success');

    } catch (error) {
        console.error('Error analyzing sentiment:', error);
        showToast('Error analyzing sentiment. Please try again later.', 'error');
    } finally {
        // Restore UI
        input.disabled = false;
        analyzeBtn.disabled = false;
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;

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
        throw new Error('API request failed');
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
            confidence: parsed.confidence || 0,
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
