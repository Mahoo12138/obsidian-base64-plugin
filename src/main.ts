import { Plugin, Modal, App, Notice, Editor, MarkdownView } from "obsidian";
import {
	EditorView,
	Decoration,
	DecorationSet,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder, EditorSelection } from "@codemirror/state";

// Base64 图片信息接口
interface Base64ImageInfo {
	fullText: string;
	alt: string;
	dataUrl: string;
	position: { from: number; to: number };
}

// 自定义 Widget 用于折叠显示 base64 图片
class Base64ImageWidget extends WidgetType {
	constructor(
		private info: Base64ImageInfo,
		private view: EditorView,
		private plugin: Base64ImagePlugin,
	) {
		super();
	}

	toDOM(): HTMLElement {
		const container = document.createElement("span");
		container.className = "base64-image-collapsed";

		// 图标
		const icon = container.createSpan({ cls: "base64-icon" });
		icon.textContent = "[图片]";

		// 文本信息
		const text = container.createSpan({ cls: "base64-text" });
		const altText = this.info.alt || "无描述";
		const size = Math.round(this.info.dataUrl.length / 1024);
		text.textContent = `${altText} (${size}KB)`;

		// 点击编辑按钮
		const editBtn = container.createSpan({ cls: "base64-edit-btn" });
		editBtn.textContent = "编辑";

		container.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: var(--background-secondary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 6px;
            padding: 4px 10px;
            cursor: pointer;
            font-size: 0.9em;
            max-width: 400px;
        `;

		icon.style.cssText =
			"font-size: 0.9em; color: var(--text-accent); font-weight: 600;";
		text.style.cssText = `
            color: var(--text-muted);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        `;
		editBtn.style.cssText = `
            color: var(--text-accent);
            font-size: 0.85em;
            padding: 2px 6px;
            background: var(--interactive-accent);
            color: white;
            border-radius: 3px;
            opacity: 0.8;
        `;

		// 悬停效果
		container.addEventListener("mouseenter", () => {
			container.style.background = "var(--background-modifier-hover)";
			editBtn.style.opacity = "1";
		});
		container.addEventListener("mouseleave", () => {
			container.style.background = "var(--background-secondary)";
			editBtn.style.opacity = "0.8";
		});

		// 点击打开 Modal
		container.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();

			// 获取当前编辑器
			const activeView =
				this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView) {
				new Base64ImageModal(
					this.plugin.app,
					this.info,
					activeView.editor,
					this.plugin,
				).open();
			}
		});

		return container;
	}

	eq(other: Base64ImageWidget): boolean {
		return this.info.fullText === other.info.fullText;
	}
}

// Base64 图片管理 Modal
class Base64ImageModal extends Modal {
	private info: Base64ImageInfo;
	private editor: Editor;
	private plugin: Base64ImagePlugin;
	private previewImg: HTMLImageElement | null = null;

	constructor(
		app: App,
		info: Base64ImageInfo,
		editor: Editor,
		plugin: Base64ImagePlugin,
	) {
		super(app);
		this.info = info;
		this.editor = editor;
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		contentEl.addClass("base64-image-modal");

		// 设置 Modal 容器宽度
		modalEl.style.width = "700px";
		modalEl.style.maxWidth = "90vw";

		// 隐藏 Obsidian 默认的关闭按钮
		const defaultCloseBtn = modalEl.querySelector(".modal-close-button");
		if (defaultCloseBtn) {
			(defaultCloseBtn as HTMLElement).style.display = "none";
		}

		// 标题栏（包含标题和关闭按钮）
		const headerEl = contentEl.createDiv({ cls: "modal-header" });
		headerEl.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--background-modifier-border);
            margin-bottom: 20px;
            background: var(--background-primary);
        `;

		headerEl.createEl("h2", {
			text: "Base64 图片管理",
			cls: "modal-title",
		});

		const closeBtn = headerEl.createEl("button", {
			text: "×",
			cls: "modal-close-btn",
		});
		closeBtn.style.cssText = `
            font-size: 28px;
            line-height: 1;
            padding: 0;
            width: 32px;
            height: 32px;
            border: none;
            background: transparent;
            color: var(--text-muted);
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.2s;
        `;
		closeBtn.addEventListener("mouseenter", () => {
			closeBtn.style.background = "var(--background-modifier-hover)";
			closeBtn.style.color = "var(--text-normal)";
		});
		closeBtn.addEventListener("mouseleave", () => {
			closeBtn.style.background = "transparent";
			closeBtn.style.color = "var(--text-muted)";
		});
		closeBtn.addEventListener("click", () => {
			this.close();
		});

		// 内容区域（不设置滚动，让 Modal 本身处理滚动）
		const contentArea = contentEl.createDiv({ cls: "modal-content-area" });

		// 图片预览区域
		const previewSection = contentArea.createDiv({
			cls: "preview-section",
		});
		previewSection.createEl("h3", { text: "图片预览" });

		const previewContainer = previewSection.createDiv({
			cls: "preview-container",
		});
		this.previewImg = previewContainer.createEl("img", {
			cls: "preview-image",
		});
		this.previewImg.src = this.info.dataUrl;
		this.previewImg.style.cssText = `
            max-width: 100%;
            max-height: 300px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        `;

		// Base64 替换区域（放在预览下方）
		const base64Section = contentArea.createDiv({ cls: "base64-section" });
		base64Section.createEl("h3", { text: "替换图片" });

		const hint = base64Section.createDiv({ cls: "base64-hint" });
		hint.textContent = "提示：可以直接粘贴图片或 Base64 字符串";
		hint.style.cssText = `
            font-size: 0.85em;
            color: var(--text-muted);
            margin-bottom: 8px;
            padding: 6px 10px;
            background: var(--background-secondary);
            border-radius: 4px;
            border-left: 3px solid var(--interactive-accent);
        `;

		const base64Textarea = base64Section.createEl("textarea", {
			placeholder: "粘贴 Base64 字符串或直接粘贴图片 (Ctrl/Cmd + V)...",
		});
		base64Textarea.value = this.truncateBase64Display(this.info.dataUrl);
		base64Textarea.style.cssText = `
            width: 100%;
            min-height: 120px;
            max-height: 200px;
            padding: 10px 12px;
            border: 2px dashed var(--background-modifier-border);
            border-radius: 6px;
            background: var(--background-primary);
            color: var(--text-normal);
            font-family: monospace;
            font-size: 0.85em;
            resize: vertical;
            transition: border-color 0.2s;
            box-sizing: border-box;
            word-break: break-all;
        `;

		// 粘贴事件处理
		let currentBase64: string = this.info.dataUrl;

		base64Textarea.addEventListener("paste", async (e) => {
			e.preventDefault();

			const items = e.clipboardData?.items;
			if (!items) return;

			// 检查是否粘贴了图片
			for (let i = 0; i < items.length; i++) {
				const item = items[i];

				// 处理图片粘贴
				if (item.type.indexOf("image") !== -1) {
					const blob = item.getAsFile();
					if (blob) {
						base64Textarea.value = "正在转换图片...";
						base64Textarea.style.borderColor =
							"var(--interactive-accent)";

						try {
							const base64 = await this.blobToBase64(blob);
							currentBase64 = base64;
							base64Textarea.value =
								this.truncateBase64Display(base64);
							base64Textarea.style.borderColor =
								"var(--interactive-success)";

							// 更新预览图片
							if (this.previewImg) {
								this.previewImg.src = base64;
							}

							new Notice("图片已转换为 Base64");
						} catch (error) {
							base64Textarea.value = "转换失败: " + error.message;
							base64Textarea.style.borderColor =
								"var(--text-error)";
							new Notice("转换图片失败");
						}
					}
					return;
				}
			}

			// 处理文本粘贴（Base64 字符串）
			const text = e.clipboardData?.getData("text");
			if (text) {
				base64Textarea.value = "正在验证 Base64...";

				try {
					const cleanedBase64 = this.cleanBase64Input(text);

					if (this.isValidBase64Image(cleanedBase64)) {
						currentBase64 = cleanedBase64;
						base64Textarea.value =
							this.truncateBase64Display(cleanedBase64);
						base64Textarea.style.borderColor =
							"var(--interactive-success)";

						// 更新预览图片
						if (this.previewImg) {
							this.previewImg.src = cleanedBase64;
						}

						new Notice("Base64 验证成功");
					} else {
						throw new Error("无效的 Base64 图片格式");
					}
				} catch (error) {
					base64Textarea.value = error.message;
					base64Textarea.style.borderColor = "var(--text-error)";
					new Notice("Base64 格式无效");
				}
			}
		});

		// 焦点样式
		base64Textarea.addEventListener("focus", () => {
			base64Textarea.style.borderColor = "var(--interactive-accent)";
			base64Textarea.style.borderStyle = "solid";
		});

		base64Textarea.addEventListener("blur", () => {
			base64Textarea.style.borderColor =
				"var(--background-modifier-border)";
			base64Textarea.style.borderStyle = "dashed";
		});

		// 图片信息
		const infoSection = contentArea.createDiv({ cls: "info-section" });
		infoSection.createEl("h3", { text: "图片信息" });

		const infoList = infoSection.createDiv({ cls: "info-list" });
		const size = Math.round(this.info.dataUrl.length / 1024);
		const format =
			this.info.dataUrl.match(/data:image\/(\w+);/)?.[1] || "未知";

		infoList.createDiv({ text: `描述: ${this.info.alt || "无"}` });
		infoList.createDiv({ text: `大小: ${size} KB` });
		infoList.createDiv({ text: `格式: ${format.toUpperCase()}` });

		// Alt 文本编辑
		const altSection = contentArea.createDiv({ cls: "alt-section" });
		altSection.createEl("h3", { text: "编辑描述" });

		const altInput = altSection.createEl("input", {
			type: "text",
			placeholder: "输入图片描述...",
			value: this.info.alt,
		});
		altInput.style.cssText = `
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 4px;
            background: var(--background-primary);
            color: var(--text-normal);
            box-sizing: border-box;
        `;

		// 按钮区域
		const buttonSection = contentEl.createDiv({ cls: "button-section" });
		buttonSection.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid var(--background-modifier-border);
        `;

		// 保存修改按钮（应用 Alt 和 Base64 的所有更改）
		const saveBtn = buttonSection.createEl("button", { text: "保存修改" });
		saveBtn.style.gridColumn = "1 / -1";
		saveBtn.addEventListener("click", () => {
			this.saveChanges(altInput.value, currentBase64);
		});

		// 转换为本地文件按钮
		const convertBtn = buttonSection.createEl("button", {
			text: "转为本地文件",
		});
		convertBtn.addEventListener("click", () => {
			this.convertToLocalFile();
		});

		// 复制 Base64 按钮
		const copyBtn = buttonSection.createEl("button", {
			text: "复制 Base64",
		});
		copyBtn.addEventListener("click", () => {
			navigator.clipboard.writeText(this.info.dataUrl);
			new Notice("Base64 数据已复制到剪贴板");
		});

		// 下载图片按钮
		const downloadBtn = buttonSection.createEl("button", {
			text: "下载图片",
		});
		downloadBtn.addEventListener("click", () => {
			this.downloadImage();
		});

		// 删除按钮
		const deleteBtn = buttonSection.createEl("button", {
			text: "删除图片",
			cls: "mod-warning",
		});
		deleteBtn.addEventListener("click", () => {
			this.deleteImage();
		});

		// 样式美化
		this.applyStyles();
	}

	applyStyles() {
		const { contentEl } = this;
		contentEl.style.cssText = `
            padding: 20px;
        `;

		const header = contentEl.querySelector(".modal-header") as HTMLElement;
		if (header) {
			header.style.paddingTop = "0";
		}

		const buttonSection = contentEl.querySelector(
			".button-section",
		) as HTMLElement;
		if (buttonSection) {
			buttonSection.style.paddingBottom = "0";
		}

		const sections = contentEl.querySelectorAll(
			".preview-section, .info-section, .alt-section, .base64-section",
		);
		sections.forEach((section) => {
			(section as HTMLElement).style.cssText = `
                margin-bottom: 20px;
                padding: 15px;
                background: var(--background-secondary);
                border-radius: 8px;
            `;
		});

		const buttons = contentEl.querySelectorAll(
			"button:not(.modal-close-btn)",
		);
		buttons.forEach((btn) => {
			(btn as HTMLElement).style.cssText = `
                padding: 10px 16px;
                border: none;
                border-radius: 6px;
                background: var(--interactive-accent);
                color: white;
                cursor: pointer;
                font-size: 0.9em;
                transition: all 0.2s;
            `;

			btn.addEventListener("mouseenter", () => {
				(btn as HTMLElement).style.transform = "translateY(-2px)";
				(btn as HTMLElement).style.boxShadow =
					"0 4px 8px rgba(0,0,0,0.2)";
			});
			btn.addEventListener("mouseleave", () => {
				(btn as HTMLElement).style.transform = "translateY(0)";
				(btn as HTMLElement).style.boxShadow = "none";
			});
		});

		// 警告按钮特殊样式
		const warningBtn = contentEl.querySelector(
			".mod-warning",
		) as HTMLElement;
		if (warningBtn) {
			warningBtn.style.background = "#d32f2f";
		}
	}

	// 更新 Alt 文本
	updateAltText(newAlt: string) {
		const newText = `![${newAlt}](${this.info.dataUrl})`;
		this.editor.replaceRange(
			newText,
			this.editor.offsetToPos(this.info.position.from),
			this.editor.offsetToPos(this.info.position.to),
		);
		new Notice("图片描述已更新");
		this.close();
	}

	// 保存所有修改（Alt + Base64）
	saveChanges(newAlt: string, newBase64: string) {
		const newText = `![${newAlt}](${newBase64})`;
		this.editor.replaceRange(
			newText,
			this.editor.offsetToPos(this.info.position.from),
			this.editor.offsetToPos(this.info.position.to),
		);
		new Notice("图片已更新");
		this.close();
	}

	// 将 Blob 转换为 Base64
	blobToBase64(blob: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => {
				const result = reader.result as string;
				resolve(result);
			};
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
	}

	// 清理 Base64 输入（移除可能的前缀、空格等）
	cleanBase64Input(input: string): string {
		let cleaned = input.trim();

		// 如果已经是完整的 data URL，直接返回
		if (cleaned.startsWith("data:image/")) {
			return cleaned;
		}

		// 如果只是 base64 字符串，添加前缀
		// 尝试检测图片类型
		const imageType = this.detectImageType(cleaned);
		return `data:image/${imageType};base64,${cleaned}`;
	}

	// 检测图片类型（简单判断）
	detectImageType(base64: string): string {
		// 移除可能的换行和空格
		const cleaned = base64.replace(/\s/g, "");

		// PNG 的 magic number: iVBORw0KGgo
		if (cleaned.startsWith("iVBORw0KGgo")) return "png";

		// JPEG 的 magic number: /9j/
		if (cleaned.startsWith("/9j/")) return "jpeg";

		// GIF 的 magic number: R0lGOD
		if (cleaned.startsWith("R0lGOD")) return "gif";

		// WebP 的 magic number: UklGR
		if (cleaned.startsWith("UklGR")) return "webp";

		// 默认返回 png
		return "png";
	}

	// 验证是否是有效的 Base64 图片
	isValidBase64Image(dataUrl: string): boolean {
		try {
			// 检查格式
			if (!dataUrl.startsWith("data:image/")) {
				return false;
			}

			// 尝试解析
			const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
			if (!matches) {
				return false;
			}

			const base64Data = matches[2];

			// 验证 base64 格式
			const base64Regex = /^[A-Za-z0-9+/]+=*$/;
			if (!base64Regex.test(base64Data.replace(/\s/g, ""))) {
				return false;
			}

			// 尝试解码
			atob(base64Data.substring(0, 100)); // 只验证前100个字符

			return true;
		} catch (error) {
			return false;
		}
	}

	// 截断 Base64 显示（显示前后部分）
	truncateBase64Display(dataUrl: string): string {
		const maxLength = 200;
		if (dataUrl.length <= maxLength) {
			return dataUrl;
		}

		const start = dataUrl.substring(0, 100);
		const end = dataUrl.substring(dataUrl.length - 100);
		return `${start}\n... (${Math.round(dataUrl.length / 1024)} KB) ...\n${end}`;
	}

	// 转换为本地文件
	async convertToLocalFile() {
		try {
			// 获取当前文件路径
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) {
				new Notice("无法获取当前文件");
				return;
			}

			// 解析 base64
			const matches = this.info.dataUrl.match(
				/data:image\/(\w+);base64,(.+)/,
			);
			if (!matches) {
				new Notice("无效的 Base64 格式");
				return;
			}

			const [, format, base64Data] = matches;
			const fileName = `image-${Date.now()}.${format}`;

			// 获取附件文件夹
			const attachmentFolder =
				this.app.vault.getConfig("attachmentFolderPath") ||
				"attachments";
			const folderPath = attachmentFolder.replace(
				"${notename}",
				activeFile.basename,
			);

			// 确保文件夹存在
			await this.ensureFolderExists(folderPath);

			// 转换 base64 为二进制
			const binaryString = atob(base64Data);
			const bytes = new Uint8Array(binaryString.length);
			for (let i = 0; i < binaryString.length; i++) {
				bytes[i] = binaryString.charCodeAt(i);
			}

			// 保存文件
			const filePath = `${folderPath}/${fileName}`;
			await this.app.vault.createBinary(filePath, bytes);

			// 替换为本地链接
			const newText = `![${this.info.alt}](${filePath})`;
			this.editor.replaceRange(
				newText,
				this.editor.offsetToPos(this.info.position.from),
				this.editor.offsetToPos(this.info.position.to),
			);

			new Notice(`图片已保存到: ${filePath}`);
			this.close();
		} catch (error) {
			console.error("转换失败:", error);
			new Notice("转换为本地文件失败: " + error.message);
		}
	}

	// 确保文件夹存在
	async ensureFolderExists(path: string) {
		const folders = path.split("/");
		let currentPath = "";

		for (const folder of folders) {
			currentPath = currentPath ? `${currentPath}/${folder}` : folder;
			if (!(await this.app.vault.adapter.exists(currentPath))) {
				await this.app.vault.createFolder(currentPath);
			}
		}
	}

	// 下载图片
	downloadImage() {
		const link = document.createElement("a");
		link.href = this.info.dataUrl;
		link.download = `${this.info.alt || "image"}-${Date.now()}.png`;
		link.click();
		new Notice("图片下载已开始");
	}

	// 删除图片
	deleteImage() {
		this.editor.replaceRange(
			"",
			this.editor.offsetToPos(this.info.position.from),
			this.editor.offsetToPos(this.info.position.to),
		);
		new Notice("图片已删除");
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// ViewPlugin 用于检测和装饰 base64 图片
function createBase64Plugin(plugin: Base64ImagePlugin) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(private view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				const text = view.state.doc.toString();

				// 匹配 Markdown 格式的 base64 图片: ![alt](data:image/...)
				const regex = /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g;
				let match;

				while ((match = regex.exec(text)) !== null) {
					const from = match.index;
					const to = from + match[0].length;

					// 只处理较长的 base64（避免误匹配）
					if (match[2].length > 100) {
						const info: Base64ImageInfo = {
							fullText: match[0],
							alt: match[1],
							dataUrl: match[2],
							position: { from, to },
						};

						const widget = Decoration.replace({
							widget: new Base64ImageWidget(info, view, plugin),
							block: false,
						});

						builder.add(from, to, widget);
					}
				}

				return builder.finish();
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);
}

// 主插件类
export default class Base64ImagePlugin extends Plugin {
	async onload() {
		console.log("Loading Base64 Image Manager Plugin");

		// 注册 Editor Extension
		this.registerEditorExtension([createBase64Plugin(this)]);

		// 添加全局样式
		this.addGlobalStyles();

		// 添加命令：查找所有 base64 图片
		this.addCommand({
			id: "find-all-base64-images",
			name: "查找所有 Base64 图片",
			editorCallback: (editor: Editor) => {
				this.findAllBase64Images(editor);
			},
		});
	}

	addGlobalStyles() {
		const style = document.createElement("style");
		style.id = "base64-manager-styles";
		style.textContent = `
            .base64-image-collapsed {
                transition: all 0.2s ease;
            }
            
            .base64-image-modal {
                overflow-x: hidden !important;
            }
            
            .preview-container {
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 20px;
                background: var(--background-primary);
                border-radius: 8px;
                overflow: hidden;
            }
            
            .info-list > div {
                padding: 8px 0;
                border-bottom: 1px solid var(--background-modifier-border);
            }
            
            .info-list > div:last-child {
                border-bottom: none;
            }
        `;
		document.head.appendChild(style);
	}

	findAllBase64Images(editor: Editor) {
		const text = editor.getValue();
		const regex = /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g;
		const matches = [...text.matchAll(regex)];

		if (matches.length === 0) {
			new Notice("未找到任何 Base64 图片");
		} else {
			new Notice(`找到 ${matches.length} 个 Base64 图片`);
		}
	}

	onunload() {
		console.log("Unloading Base64 Image Manager Plugin");
		document.getElementById("base64-manager-styles")?.remove();
	}
}
