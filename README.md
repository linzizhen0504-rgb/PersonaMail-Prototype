# IUI26-PersonaMail

This project is part of the Synteraction Lab's research. It explores generative AI applications in email communication.

## Acknowledgments
This project was originally developed by **Rachel ([@RachelR1001](https://github.com/RachelR1001))**. We sincerely acknowledge her foundational work, system architecture design, and significant contributions to the initial codebase.

---

## Getting Started

### 1. Clone the project
```bash
git clone [https://github.com/Synteraction-Lab/IUI26-PersonaMail.git](https://github.com/Synteraction-Lab/IUI26-PersonaMail.git)
cd IUI26-PersonaMail

```

### 2. Install Dependencies

```bash
npm install

```
### 3. Configure API Keys

You must manually add your Generative AI API keys in the following files:

* **In `serverGM.js`**: Replace `'ENTER YOUR API KEY HERE'` with your **Gemini API Key**.
* **In `serverDB.js`**: Replace `'ENTER YOUR KEY HERE'` with your **Doubao API Key**.

### 4. Run the Project

You need to open **three independent terminal windows** to run the full system:

* **Terminal 1 (Frontend):**
    ```bash
    npm start
    ```

* **Terminal 2 (Gemini Server):**
    ```bash
    node serverGM.js
    ```

* **Terminal 3 (Database/Doubao Server):**
    ```bash
    node serverDB.js
    ```



---

## Known Issues & Usage Notes

* **Factor Settings Bug:** To test the *Persona* and *Situation Anchor* functions, you must **explicitly click "Save"** in the Factor Exploration Panel after entering your values.
* This is a known synchronization bug and will be fixed in the next version. However, manually saving does not affect the full functionality or experience of the system.