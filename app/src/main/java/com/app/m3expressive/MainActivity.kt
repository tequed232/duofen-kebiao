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
 *   1. 运行时权限（相机 / 麦克风 / 通知）
 *   2. 用系统内置文件资源浏览器（SAF）响应网页的 <input type=file>
 *   3. 通过 JS 桥发布 Android 16 / ColorOS 流体云进度通知
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

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
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.allowFileAccess = false
            settings.allowContentAccess = true
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            webChromeClient = chromeClient()
            webViewClient = object : WebViewClient() {
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

        setContentView(webView)

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
            view.post {
                webView.evaluateJavascript(
                    "document.documentElement.style.setProperty('--native-inset-top','${bars.top}px');" +
                        "document.documentElement.style.setProperty('--native-inset-bottom','${bars.bottom}px');",
                    null,
                )
            }
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

    private fun chromeClient() = object : WebChromeClient() {
        /** 网页请求相机 / 麦克风：应用已授权就直接放行，否则先申请运行时权限 */
        override fun onPermissionRequest(request: PermissionRequest) {
            val missing = request.resources.mapNotNull { resource ->
                when (resource) {
                    PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
                    PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA
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

        @JavascriptInterface
        fun stopLiveUpdate() {
            runOnUiThread { LiveUpdates.clear(this@MainActivity) }
        }

        @JavascriptInterface
        fun requestPermissions() {
            runOnUiThread {
                val wanted = mutableListOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA)
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
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        webView.destroy()
        super.onDestroy()
    }
}
