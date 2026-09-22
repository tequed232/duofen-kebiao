package com.app.m3expressive

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.graphics.ColorUtils
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.webkit.WebViewAssetLoader

/**
 * 多分课表 · Android 宿主
 *
 * 这里**没有任何自有界面**：APK 加载的是与网站完全相同的 Web 构建
 * （构建时由 syncWebAssets 把 dist/ 同步到 assets/www），因此 APK 与网页永远一致。
 * 原生侧只做三件 Web 自己做不到的事：
 *   1. 运行时权限（麦克风 / 通知）
 *   2. 用系统内置文件资源浏览器（SAF）响应网页的 <input type=file>
 *   3. 通过 JS 桥发布 Android 16 / ColorOS 流体云进度通知
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var dock: NativeDock? = null
    private var confirmReceiver: android.content.BroadcastReceiver? = null
    /** 通知里的「课本」动作被点击：下次页面加载完成后跳到教材窗口 */
    private var pendingTextbooks = false
    private var pendingCourse: String? = null
    private var insetTopPx = 0
    private var insetBottomPx = 0

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { granted ->
        val payload = granted.entries.joinToString(",") { "${it.key}=${it.value}" }
        webView.evaluateJavascript(
            "window.__duofenPermissionResult__ && window.__duofenPermissionResult__('$payload')",
            null,
        )
    }

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val data = result.data?.data
        fileChooserCallback?.onReceiveValue(if (data != null) arrayOf(data) else null)
        fileChooserCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        LiveUpdates.ensureChannel(this)

        // 站点资源经 https://appassets.androidplatform.net/assets/www/ 提供：
        // 与网站同源行为，IndexedDB / fetch / getUserMedia 都可用（file:// 会被限制）
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            // 每次启动清缓存 + 不走缓存：否则 WebView 会拿旧的 index.html，
            // 导致"改了样式但手机上没变化"（本地文件也不会走 HTTP 缓存）
            settings.cacheMode = WebSettings.LOAD_NO_CACHE
            settings.allowFileAccess = false
            settings.allowContentAccess = true
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            webChromeClient = chromeClient()
            webViewClient = object : WebViewClient() {
                /** 页面每次加载完成后重新注入一次 insets（首次注入会被页面加载冲掉） */
                override fun onPageFinished(view: WebView, url: String) {
                    super.onPageFinished(view, url)
                    injectInsets()
                    view.postDelayed({ injectInsets() }, 600)
                    if (pendingTextbooks) {
                        pendingTextbooks = false
                        view.postDelayed({
                            view.evaluateJavascript("window.DuofenOpen && window.DuofenOpen.textbooks()", null)
                        }, 900)
                    }
                }
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assetLoader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url
                    return if (url.host == "appassets.androidplatform.net") {
                        false
                    } else {
                        // 外部链接（地图 App、GitHub、Bilibili）交给系统
                        runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                        true
                    }
                }
            }
            addJavascriptInterface(NativeBridge(), "DuofenNative")
            loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
        }

        // 原生 Liquid Glass 底边栏（Android 13+）：叠在 WebView 之上，
        // 每帧 PixelCopy 抓取条带真实画面并用 AGSL 折射 → 与酷安同款的「背景实时掰弯」。
        val root = android.widget.FrameLayout(this)
        // 通知里的「课本」动作：带这个 action 打开应用时，页面就绪后跳到教材窗口
        if (intent?.action == LiveUpdates.ACTION_SHOW_TEXTBOOKS) {
            pendingTextbooks = true
            pendingCourse = intent.getStringExtra("course")
        }

        // 【回滚】原生 Dock 在作者真机上不可用（可见但点击无反应），已停用：
        // 网页自己绘制的 Material 3 底栏（在浏览器里已验证可用）重新接管导航。
        root.addView(
            webView,
            android.widget.FrameLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        webView.clearCache(true)
        setContentView(root)

        // 通知上的「确认」按钮 → 直接回到网页并触发确认流程（不用打开应用再点一次）
        confirmReceiver = object : android.content.BroadcastReceiver() {
            override fun onReceive(context: android.content.Context?, intent: Intent?) {
                webView.evaluateJavascript(
                    "window.__duofenLiveConfirm__ && window.__duofenLiveConfirm__();",
                    null,
                )
            }
        }
        androidx.core.content.ContextCompat.registerReceiver(
            this,
            confirmReceiver,
            android.content.IntentFilter(LiveUpdates.ACTION_CONFIRM),
            androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED,
        )

        // Android 13+ 通知权限：流体云卡片依赖它，启动时就申请
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                permissionLauncher.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
            }
        }

        // 状态栏 / 导航栏留白：Android 15+ 强制 edge-to-edge，不给 insets 的话
        // 顶部标题会被状态栏（时间、电量）压住。这里把系统栏高度作为 WebView 的内边距，
        // 并把窗口与 WebView 底色设成应用的 surface 色，让留白区域自然衔接。
        val surface = ColorUtils.setAlphaComponent(android.graphics.Color.parseColor("#F5FBF6"), 255)
        window.decorView.setBackgroundColor(surface)
        webView.setBackgroundColor(surface)
        // 全屏呈现：不再为状态栏整页留白（用户反馈留白比不留更难看）。
        // 改为把状态栏高度交给网页，只让「顶栏内容」下移 —— 顶栏背景铺到状态栏下面，
        // 既不会被时间/电量压住，也不会出现一条空白色带。
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.updatePadding(left = cutout.left, right = cutout.right)
            // 记录 insets：网页加载完成后再注入一次（首次注入常常发生在页面加载前而被冲掉，
            // 这正是「安全区没生效」的原因）
            insetTopPx = bars.top
            insetBottomPx = bars.bottom
            injectInsets()
            insets
        }
        ViewCompat.requestApplyInsets(webView)

        // 可预测式返回：先走网页自己的历史栈，退无可退再退出应用
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            },
        )
    }

    /** 把系统栏高度写进 CSS 变量（dp，除以 density；网页据此给顶栏留白） */
    private fun injectInsets() {
        val density = resources.displayMetrics.density
        val js = "document.documentElement.style.setProperty('--native-inset-top','${insetTopPx / density}px');" +
            "document.documentElement.style.setProperty('--native-inset-bottom','${insetBottomPx / density}px');" +
            "document.documentElement.style.setProperty('--native-dock','${NativeDock.heightPx(this) / density}px');" +
            "document.documentElement.dataset.nativeDock='1';"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun chromeClient() = object : WebChromeClient() {
        /** 网页请求麦克风：应用已授权就直接放行，否则先申请运行时权限 */
        override fun onPermissionRequest(request: PermissionRequest) {
            val missing = request.resources.mapNotNull { resource ->
                when (resource) {
                    PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
                    // 相机功能已按作者要求剔除：视频采集请求一律不授权
                    PermissionRequest.RESOURCE_VIDEO_CAPTURE -> null
                    else -> null
                }
            }.filter { ContextCompat.checkSelfPermission(this@MainActivity, it) != PackageManager.PERMISSION_GRANTED }

            if (missing.isEmpty()) {
                request.grant(request.resources)
            } else {
                permissionLauncher.launch(missing.toTypedArray())
                request.deny() // 授权后网页会重新发起 getUserMedia
            }
        }

        /** 网页的 <input type=file> → 系统内置文件资源浏览器 */
        override fun onShowFileChooser(
            view: WebView,
            callback: ValueCallback<Array<Uri>>,
            params: FileChooserParams,
        ): Boolean {
            fileChooserCallback?.onReceiveValue(null)
            fileChooserCallback = callback
            val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                // 课表可能是 .doc/.rtf/.html/.csv 或图片：不限制类型，交给系统选择器
                type = "*/*"
            }
            return runCatching {
                fileChooserLauncher.launch(intent)
                true
            }.getOrDefault(false)
        }
    }

    /** 给网页用的原生桥：流体云进度通知 + 平台标识 */
    private inner class NativeBridge {
        /** 流体云 / Live Updates：网页录音时持续调用，带上进度 */
        @JavascriptInterface
        fun liveUpdate(title: String, text: String, progress: Int) {
            runOnUiThread {
                LiveUpdates.update(
                    this@MainActivity,
                    title,
                    text,
                    if (progress in 0..100) progress else null,
                )
            }
        }

        /** 设置页「发送实况测试」 */
        @JavascriptInterface
        fun testLiveUpdate() {
            runOnUiThread { LiveUpdates.test(this@MainActivity) }
        }

        @JavascriptInterface
        fun stopLiveUpdate() {
            runOnUiThread { LiveUpdates.clear(this@MainActivity) }
        }

        @JavascriptInterface
        fun requestPermissions() {
            runOnUiThread {
                val wanted = mutableListOf(Manifest.permission.RECORD_AUDIO, )
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    wanted += Manifest.permission.POST_NOTIFICATIONS
                }
                permissionLauncher.launch(
                    wanted.filter {
                        ContextCompat.checkSelfPermission(this@MainActivity, it) != PackageManager.PERMISSION_GRANTED
                    }.toTypedArray(),
                )
            }
        }

        @JavascriptInterface
        fun platform(): String = "android"

        /** 网页开启原生玻璃条（仅当用户在设置里选了液态玻璃） */

        /** 手指位置（归一化 0..1）与按下状态 → shader uniform，实现跟手折射 */

        /** 页面滚动冲量 → 折射强度与高光亮度 */
        /** 上课提醒（实况通知 / 灵动岛）：网页排好课后由这里发通知 */
        @JavascriptInterface
        fun classReminder(
            course: String,
            room: String,
            timeText: String,
            textbooks: String,
            minutesLeft: Int,
            startAtMillis: Long,
            navigateUri: String,
        ) {
            LiveUpdates.classReminder(
                this@MainActivity,
                course,
                room,
                timeText,
                textbooks,
                minutesLeft,
                startAtMillis,
                navigateUri.ifBlank { null },
            )
        }

        /** 下课 / 取消提醒 */
        @JavascriptInterface
        fun stopClassReminder() {
            LiveUpdates.clear(this@MainActivity)
        }

        /** 网页同步当前选中的标签（路由变化时调用） */
        @JavascriptInterface
        fun dockActive(index: Int) {
            runOnUiThread { dock?.activeIndex = index }
        }
    }

    /** 应用已在前台时点通知里的动作：走同一套逻辑 */
    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.action == LiveUpdates.ACTION_SHOW_TEXTBOOKS) {
            webView.postDelayed({
                webView.evaluateJavascript("window.DuofenOpen && window.DuofenOpen.textbooks()", null)
            }, 600)
        }
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        webView.destroy()
        super.onDestroy()
    }
}
