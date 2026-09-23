import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/* ---------------------------------------------------------------------------
 * 网页一致性（硬要求）
 *
 * APK 不再自带一套 Compose 界面，而是**把与网站完全相同的 Web 构建（dist/）打进
 * assets/www**，用 WebView 加载。下面的 Copy 任务挂在 preBuild 上，因此每次编译
 * APK 都会先同步最新 dist/，不存在“APK 与网页对不上”的可能。
 *
 * 版本号也从 web/src/lib/meta.ts 里读，网页与 APK 共用一个版本来源。
 * ------------------------------------------------------------------------- */

val webDistDir = rootProject.layout.projectDirectory.dir("dist").asFile
val webAssetsDir = layout.projectDirectory.dir("src/main/assets/www").asFile

/** 从 web/src/lib/meta.ts 读取 APP_VERSION（如 v1.0.5 → 1.0.5 / versionCode 用 major*10000+minor*100+patch） */
fun webVersion(): Pair<Int, String> {
    val meta = rootProject.file("web/src/lib/meta.ts")
    val match = Regex("APP_VERSION\\s*=\\s*'v?([0-9]+)\\.([0-9]+)\\.([0-9]+)'").find(meta.readText())
        ?: return 6 to "1.0.5"
    val (major, minor, patch) = match.destructured
    val code = major.toInt() * 10000 + minor.toInt() * 100 + patch.toInt()
    return code to "$major.$minor.$patch"
}

val (webVersionCode, webVersionName) = webVersion()

/**
 * 正式签名：仓库根放 keystore.properties（已在 .gitignore 中）即可启用。
 * 文件不存在时回退 debug 签名，保证 CI 与刚克隆的仓库照样能构建。
 */
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) keystorePropertiesFile.inputStream().use { load(it) }
}
val hasReleaseKeystore = keystorePropertiesFile.exists()

/** 把 dist/ 同步进 app/src/main/assets/www（删除旧文件，保证不残留旧 bundle） */
val syncWebAssets by tasks.registering(Copy::class) {
    // 永远执行：Gradle 的 up-to-date 判定曾导致新构建没有进 APK（改样式看不到效果）
    outputs.upToDateWhen { false }
    description = "Copy the web build (dist/) into the APK assets so the app matches the site"
    from(webDistDir)
    into(webAssetsDir)
    doFirst {
        require(webDistDir.resolve("index.html").exists()) {
            "dist/index.html 不存在：请先在仓库根目录执行 npm run build 再编译 APK"
        }
        logger.lifecycle("syncWebAssets: ${webDistDir} -> ${webAssetsDir}")
    }
}

/** 同步前清空旧的 assets/www，避免旧 bundle 残留 */
val cleanWebAssets by tasks.registering(Delete::class) {
    delete(webAssetsDir)
}

tasks.named("preBuild") { dependsOn(cleanWebAssets, syncWebAssets) }

android {
    namespace = "com.app.m3expressive"
    // 本机可用的 SDK 平台为 android-35；Android 16（API 36）的 Live Updates / 流体云
    // 通过运行时反射调用，因此在 Android 16 设备上依然会进入流体云。
    // 若已安装 platforms;android-36，把下面两行改为 36 即可获得 targetSdk 36 构建。
    compileSdk = 35

    defaultConfig {
        applicationId = "com.app.m3expressive"
        minSdk = 26
        targetSdk = 35
        // 与网页同源：versionCode/versionName 由 web/src/lib/meta.ts 的 APP_VERSION 决定。
        // 之前这里是硬编码的 20600 / "2.6.0"（和 webVersion() 算出来的值并存 = 两处真相，会漂移）。
        versionCode = webVersionCode
        versionName = webVersionName

        ndk {
            // 天玑 9400（MT6991）为 arm64-v8a
            abiFilters += "arm64-v8a"
        }
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // 有 keystore.properties 就用正式签名，否则退回 debug 签名（CI 不会因此变红）
            signingConfig = if (hasReleaseKeystore) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }


    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // 说明：这个 APK **没有自己的界面**，界面全部来自 web/（构建时同步 dist/ 到 assets/www）。
    // 因此这里不再依赖 Compose / Material：避免再出现一套会与网页漂移的平行实现。
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.10.0")

    // WebView 宿主：用 WebViewAssetLoader 把 assets/www 以 https 源提供，
    // 这样 IndexedDB、fetch、getUserMedia 与网站行为一致（file:// 会被 CORS 限制）
    implementation("androidx.webkit:webkit:1.12.1")
}
