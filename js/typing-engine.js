class TypingEngine {
    constructor(text, callbacks) {
        this.fullText = text;
        this.callbacks = callbacks || {};

        this.startTime = null;
        this.endTime = null;
        this.timer = null;

        this.currentIndex = 0;
        this.errors = 0;
        this.totalTyped = 0;

        this.isStarted = false;

        this.elements = {
            display: document.getElementById('textDisplay'),
            input: document.getElementById('hiddenInput')
        };

        this.init();
    }

    init() {
        this.renderText();
        this.elements.input.addEventListener('compositionstart', () => { this.isComposing = true; });
        this.elements.input.addEventListener('compositionend', (e) => {
            this.isComposing = false;
            // Handle the final composed char (e.g., 'á')
            this.handleInput(e);
        });

        this.elements.input.addEventListener('input', (e) => {
            if (!this.isComposing) this.handleInput(e);
        });

        this.elements.input.addEventListener('blur', () => {
            if (this.isStarted && !this.endTime) this.elements.input.focus();
        });
    }

    handleInput(e) {
        if (!this.isStarted) return;
        if (this.isComposing) return; // Wait for composition end

        const inputValue = this.elements.input.value;
        if (!inputValue) return; // Empty input

        const lastChar = inputValue.slice(-1);

        // When composition ends, the event data might be the whole string or just the input event
        // We rely on 'value' being cleared, so we grab the LAST char.
        // For 'a' -> 1 char. For 'á' (dead key + a) -> value is 'á'.

        // Filter out events that are not text insertion or composition end
        if (e.type !== 'compositionend' && e.inputType !== 'insertText' && e.inputType !== 'insertFromComposition') return;

        const targetChar = this.fullText[this.currentIndex];

        this.totalTyped++;

        if (lastChar === targetChar) {
            this.markChar(this.currentIndex, 'correct');
        } else {
            this.markChar(this.currentIndex, 'incorrect');
            this.errors++;
        }

        this.currentIndex++;

        if (this.currentIndex >= this.fullText.length) {
            this.stop();
        } else {
            this.updateCursor();
        }

        this.elements.input.value = '';
    }

    renderText() {
        // Split text into spans
        const chars = this.fullText.split('').map((char, index) => {
            let className = '';
            if (index === this.currentIndex) className = 'char-current';
            return `<span class="${className}">${char}</span>`;
        }).join('');
        this.elements.display.innerHTML = chars;
    }

    start() {
        this.isStarted = true;
        this.startTime = new Date();
        this.timer = setInterval(() => this.calculateStats(), 1000);
        this.elements.input.value = '';
        this.elements.input.focus();
    }

    stop() {
        clearInterval(this.timer);
        this.endTime = new Date();
        this.calculateStats();
        if (this.callbacks.onComplete) {
            this.callbacks.onComplete({
                wpm: this.getWPM(),
                accuracy: this.getAccuracy()
            });
        }
    }



    markChar(index, status) {
        const spans = this.elements.display.querySelectorAll('span');
        if (spans[index]) {
            spans[index].className = `char-${status}`;
        }
    }

    updateCursor() {
        const spans = this.elements.display.querySelectorAll('span');
        // Remove current from all
        spans.forEach(s => s.classList.remove('char-current'));
        // Add to new
        if (spans[this.currentIndex]) {
            spans[this.currentIndex].classList.add('char-current');
        }
    }

    calculateStats() {
        if (!this.startTime) return;

        const now = new Date();
        const diffMinutes = (now - this.startTime) / 60000;

        if (diffMinutes <= 0) return;

        // WPM = (All typed entries / 5) / Time (min)
        // Standard definition uses 5 chars per word
        const wpm = Math.round((this.currentIndex / 5) / diffMinutes);

        const accuracy = this.getAccuracy();

        if (this.callbacks.onUpdate) {
            this.callbacks.onUpdate(wpm, accuracy);
        }
    }

    getWPM() {
        if (!this.startTime) return 0;
        const endTime = this.endTime || new Date();
        const diffMinutes = (endTime - this.startTime) / 60000;
        return Math.round((this.currentIndex / 5) / diffMinutes);
    }

    getAccuracy() {
        if (this.totalTyped === 0) return 100;
        return Math.round(((this.totalTyped - this.errors) / this.totalTyped) * 100);
    }
}
