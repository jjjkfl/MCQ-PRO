/**
 * js/student/result.js
 * Result display and Blockchain verification UI
 */

const ResultDetail = {
  resultId: null,

  async init() {
    const params = new URLSearchParams(window.location.search);
    this.resultId = params.get('resultId');

    if (!this.resultId) {
      window.location.href = '/index.html';
      return;
    }

    Navbar.render('nav-container');
    await this.loadResult();
  },

  async loadResult() {
    Loader.show('result-content');
    try {
      const { data } = await api.get(`/portal/student/results/${this.resultId}`);
      this.render(data);
    } catch (err) {
      notifications.error('Failed to load result');
    }
  },

  render(result) {
    const container = document.getElementById('result-content');
    
    container.innerHTML = `
      <div class="animate-fade-in" style="text-align: center; max-width: 700px; margin: 0 auto;">
        <h1 class="h1" style="margin-bottom: 8px;">Exam Completed</h1>
        <p class="p-dim" style="margin-bottom: 48px;">${result.session.title}</p>

        <div class="glass-card" style="margin-bottom: 40px; padding: 48px;">
          <div class="result-score">${result.percentage}%</div>
          <p style="font-size: 18px; margin: 16px 0;">Grade: <span class="grade-badge ${result.isPassed ? 'grade-a' : 'grade-f'}">${result.grade}</span></p>
          <div class="flex-center" style="gap: 40px; margin-top: 32px; border-top: 1px solid var(--border); padding-top: 32px;">
            <div>
              <div class="p-dim">Score</div>
              <div style="font-size: 20px; font-weight: 600;">${result.marksObtained}/${result.totalMarks}</div>
            </div>
            <div>
              <div class="p-dim">Correct</div>
              <div style="font-size: 20px; font-weight: 600;">${result.correctCount}/${result.totalQuestions}</div>
            </div>
            <div>
              <div class="p-dim">Time</div>
              <div style="font-size: 20px; font-weight: 600;">${utils.formatTime(result.timeTaken)}</div>
            </div>
          </div>
        </div>

        ${result.resultHash ? `
          <div class="blockchain-seal" onclick="ResultDetail.verifyOnChain('${result.resultHash}')" style="cursor:pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>Blockchain Secured: ${result.resultHash.substring(0, 12)}... (Verify)</span>
          </div>
        ` : ''}

        <div style="margin-top: 48px;">
          <a href="/index.html" class="btn btn-outline">Back to Dashboard</a>
          ${result.isPassed ? `<button onclick="Certificate.generate('${this.resultId}')" class="btn btn-primary" style="margin-left: 12px;">Download Certificate</button>` : ''}
        </div>
      </div>
    `;
  },

  async verifyOnChain(hash) {
    Modal.show('verify', `
      <div style="text-align: center">
        <div class="spinner" style="margin: 0 auto 20px;"></div>
        <p>Querying Ethereum Smart Contract...</p>
      </div>
    `, { title: 'Verifying Integrity' });

    try {
      const { data } = await api.post('/portal/blockchain/verify', { resultHash: hash });
      
      Modal.show('verify', `
        <div style="text-align: left">
          <div style="background: rgba(52, 199, 89, 0.1); color: var(--success); padding: 16px; border-radius: 12px; margin-bottom: 24px; display:flex; align-items:center; gap:12px;">
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
             <div>
               <div style="font-weight: 600;">Hash Verified!</div>
               <div style="font-size: 12px;">Data matches blockchain record exactly.</div>
             </div>
          </div>
          <div class="p-dim" style="font-size: 12px; margin-bottom: 4px;">Sealed On</div>
          <div style="margin-bottom: 16px;">${new Date(data.timestamp).toLocaleString()}</div>
          <div class="p-dim" style="font-size: 12px; margin-bottom: 4px;">Smart Contract</div>
          <div style="word-break: break-all; font-family: monospace; font-size: 12px;">${data.sealer}</div>
        </div>
      `, { title: 'Blockchain Verification', footer: '<button onclick="Modal.close()" class="btn btn-primary">Done</button>' });
    } catch (err) {
      Modal.show('verify', `<p class="error">${err.message}</p>`, { title: 'Verification Failed' });
    }
  }
};

window.ResultDetail = ResultDetail;
