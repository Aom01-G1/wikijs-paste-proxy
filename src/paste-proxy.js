(function () {
    const apiOrigin = location.origin + "/filebrowser"; // Adjust this to your filebrowser's url
    const TOKEN_KEY = "wikijs_filebrowser_jwt";
    const TIME_KEY = "wikijs_filebrowser_login_time";
    const oneDay = 24 * 60 * 60 * 1000;
    const maxRetries = 3;

    // Add the permission check button when the document is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", addDraggableButton);
    } else {
        addDraggableButton();
    }

    // Setup listener for pasting images
    setupPasteListener();

    function setupPasteListener() {
        addPasteListeners();
        patchUploadAdapter();
        setTimeout(setupPasteListener, 1000);
    }

    function addPasteListeners() {
        const cmElement = document.querySelector(".CodeMirror");
        const veElement = document.querySelector(".ck-editor__editable");

        if (cmElement && !cmElement.__pasteListenerAdded) {
            cmElement.addEventListener("paste", handlePasteEvent);
            cmElement.__pasteListenerAdded = true;
        }

        if (veElement && !veElement.__pasteListenerAdded) {
            veElement.addEventListener("paste", handlePasteEvent, true);
            veElement.__pasteListenerAdded = true;
        }
    }

    function patchUploadAdapter() {
        const editor = getVisualEditorInstance();
        if (editor?.plugins?.get('FileRepository')) {
            editor.plugins.get('FileRepository').createUploadAdapter = (loader) => ({
                upload: () => Promise.resolve({}),
                abort: () => {}
            });
        } else {
            setTimeout(patchUploadAdapter, 500);
        }
    }

    function getVisualEditorInstance() {
        const el = document.querySelector(".ck-editor__editable");
        if (!el) return null;
        if (el.ckeditorInstance) return el.ckeditorInstance;

        for (const key in el) {
            const maybeEditor = el[key];
            if (maybeEditor?.model?.change && maybeEditor?.model?.document) {
                return maybeEditor;
            }
        }
        return null;
    }

    /**
        * This function is AI generated and may not be perfect.
        * The idea is just to remind users to check whether they have permission to view images.
    */
    function addDraggableButton() {
        if (document.querySelector(".wikijs-button")) return;
        const POS_KEY_LEFT = "wikijs_button_left";
        const POS_KEY_BOTTOM = "wikijs_button_bottom";
        const btn = document.createElement("button");
        btn.textContent = "Double click to check whether\nyou have permission to view images";
        Object.assign(btn.style, {
            position: "fixed",
            padding: "8px 24px",
            backgroundColor: "#2d8cf0",
            color: "#fff",
            border: "none",
            borderRadius: "20px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            cursor: "grab",
            fontSize: "14px",
            fontWeight: "500",
            userSelect: "none",
            zIndex: 2147483647,
            whiteSpace: "nowrap",
            animation: "slideGlow 2.5s ease-in-out infinite",
        });

        const defaultLeft = 20;
        const defaultBottom = 20;
        const storedLeft = parseInt(localStorage.getItem(POS_KEY_LEFT), 10);
        const storedBottom = parseInt(localStorage.getItem(POS_KEY_BOTTOM), 10);

        const left = isNaN(storedLeft) ? defaultLeft : storedLeft;
        const bottom = isNaN(storedBottom) ? defaultBottom : storedBottom;

        btn.style.left = `${left}px`;
        btn.style.bottom = `${bottom}px`;

        const style = document.createElement("style");
        style.textContent = `
            @keyframes slideGlow {
                0%, 100% { box-shadow: 0 0 8px #2d8cf0; }
                50% { box-shadow: 0 0 20px #6ea9f7; }
            }
        `;
        document.head.appendChild(style);

        let isDragging = false;
        let startX, startY, origLeft, origBottom;

        btn.addEventListener("mousedown", (e) => {
            isDragging = true;
            btn.style.cursor = "grabbing";
            startX = e.clientX;
            startY = e.clientY;
            origLeft = parseInt(btn.style.left, 10);
            origBottom = parseInt(btn.style.bottom, 10);
            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            const btnWidth = btn.offsetWidth;
            const btnHeight = btn.offsetHeight;
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            let newLeft = origLeft + dx;
            let newBottom = origBottom - dy;

            newLeft = Math.max(0, Math.min(vw - btnWidth, newLeft));
            newBottom = Math.max(0, Math.min(vh - btnHeight, newBottom));

            btn.style.left = `${newLeft}px`;
            btn.style.bottom = `${newBottom}px`;

            localStorage.setItem(POS_KEY_LEFT, Math.round(newLeft));
            localStorage.setItem(POS_KEY_BOTTOM, Math.round(newBottom));
        });

        document.addEventListener("mouseup", () => {
            if (!isDragging) return;
            isDragging = false;
            btn.style.cursor = "grab";
        });

        btn.addEventListener("dblclick", () => {
            window.open("your filebrowser's url", "_blank");
        });

        btn.addEventListener("click", (e) => {
            e.preventDefault();
        });

        document.body.appendChild(btn);
    }

    function handlePasteEvent(e) {
        const items = e.clipboardData?.items;
        if (!items) return;

        const files = [];
        for (const item of items) {
            if (item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) files.push(file);
            }
        }

        if (files.length === 0) return;

        e.preventDefault();
        for (const file of files) {
            processSingleImageFile(file);
        }
    }

    async function processSingleImageFile(file) {
        if (!file) return;

        for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
            try {
                const jwt = await getJwtToken();
                const safeFileName = await uploadFile(file, jwt);

                const cmElement = document.querySelector(".CodeMirror");
                const visualEditor = getVisualEditorInstance();

                if (cmElement && cmElement.CodeMirror) {
                    insertMarkdownImage(cmElement.CodeMirror, file, safeFileName);
                } else if (visualEditor) {
                    insertVisualImage(visualEditor, file, safeFileName);
                } else {
                    alert("No compatible editor found.");
                }

                return;

            } catch (err) {
                console.warn(`Upload attempt ${retryCount + 1} failed:`, err);
                localStorage.removeItem(TOKEN_KEY);
                localStorage.removeItem(TIME_KEY);
            }
        }

        alert(`Image upload failed after ${maxRetries} attempts: ${file.name}`);
    }

    async function getJwtToken() {
        const token = localStorage.getItem(TOKEN_KEY);
        const loginTime = parseInt(localStorage.getItem(TIME_KEY) || "0", 10);
        const now = Date.now();

        if (token && now - loginTime < oneDay) return token;

        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TIME_KEY);

        const username = "admin"; // Replace with your filebrowser username
        const password = prompt("Please enter the password to get upload permission:", "");

        const res = await fetch(`${apiOrigin}/api/login`, {
            method: "POST",
            headers: {
                "accept": "*/*",
                "content-type": "application/json"
            },
            referrer: `${apiOrigin}/login?redirect=/files/`,
            body: JSON.stringify({ username, password, recaptcha: "" }),
            mode: "cors",
            credentials: "omit"
        });
        if (!res.ok) throw new Error("Failed to login: " + res.status);
        const newToken = await res.text();

        localStorage.setItem(TOKEN_KEY, newToken);
        localStorage.setItem(TIME_KEY, Date.now().toString());

        return newToken;
    }

    async function uploadFile(file, jwt) {
        const safeFileName = generateFileName(file.name);
        const uploadUrl = `${apiOrigin}/api/tus/uploads/${encodeURIComponent(safeFileName)}?override=false`;

        const postRes = await fetch(uploadUrl, {
            method: "POST",
            headers: {
                "accept": "*/*",
                "tus-resumable": "1.0.0",
                "upload-length": file.size.toString(),
                "x-auth": jwt
            },
            referrer: `${apiOrigin}/files/uploads/`,
            mode: "cors"
        });

        if (!postRes.ok) {
            const msg = await postRes.text();
            throw new Error("Failed to initiate upload: " + msg);
        }

        const patchRes = await fetch(uploadUrl, {
            method: "PATCH",
            headers: {
                "accept": "*/*",
                "content-type": "application/offset+octet-stream",
                "tus-resumable": "1.0.0",
                "upload-offset": "0",
                "x-auth": jwt
            },
            body: file,
            referrer: `${apiOrigin}/files/uploads/`,
            mode: "cors"
        });

        if (!patchRes.ok) {
            const msg = await patchRes.text();
            throw new Error("Failed to upload file: " + msg);
        }

        return safeFileName;
    }

    function generateFileName(originalName) {
        const now = new Date();
        const timestamp = now.toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
        const random = Math.floor(Math.random() * 1e6).toString().padStart(6, "0");
        return `${timestamp}_${random}_${originalName}`;
    }

    function insertMarkdownImage(cm, file, safeFileName) {
        const from = cm.getCursor("from");
        const link = `${apiOrigin}/api/raw/uploads/${encodeURIComponent(safeFileName)}?inline=true`;
        const block = `![${file.name}](${link})`;

        cm.replaceSelection(block);
        cm.setCursor({ line: from.line + 2, ch: 0 });
    }

    function insertVisualImage(editor, file, safeFileName) {
        const link = `${apiOrigin}/api/raw/uploads/${encodeURIComponent(safeFileName)}?inline=true`;

        editor.model.change(writer => {
            const imageElement = writer.createElement('image', {
                src: link,
                alt: file.name
            });
            editor.model.insertContent(imageElement, editor.model.document.selection);
        });
    }
})();

