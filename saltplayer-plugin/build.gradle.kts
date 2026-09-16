import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.dsl.JvmDefaultMode

plugins {
    id("java-library")
    kotlin("jvm")
    kotlin("kapt")
}

group = "io.github.troisfosref"
version = "1.0.0"

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_21
        jvmDefault = JvmDefaultMode.NO_COMPATIBILITY
    }
}

dependencies {
    compileOnly(kotlin("stdlib"))

    val workshopApi = "com.github.Moriafly:spw-workshop-api:0.1.0-dev20"
    compileOnly(workshopApi)
    kapt(workshopApi)

    implementation("com.github.hypfvieh:dbus-java-core:5.2.0")
    implementation("com.github.hypfvieh:dbus-java-transport-native-unixsocket:5.2.0")

    testImplementation(kotlin("test-junit"))
    testImplementation("junit:junit:4.13.2")
}

val pluginClass = "io.github.saltplayer.lyrics.SaltLyricsPlugin"
val pluginId = "io.github.troisfosref.saltplayer.lyrics"
val pluginName = "GNOME Top Bar Lyrics Bridge"
val pluginVersion = project.version.toString()
val pluginRepository = "https://github.com/Troisfosref/saltplayer-gnome-lyrics"

tasks.named<Jar>("jar") {
    manifest {
        attributes(
            "Plugin-Class" to pluginClass,
            "Plugin-Id" to pluginId,
            "Plugin-Name" to pluginName,
            "Plugin-Description" to "Publishes Salt Player synchronized lyrics on the Linux session D-Bus",
            "Plugin-Version" to pluginVersion,
            "Plugin-Provider" to "Troisfosref",
            "Plugin-Open-Source-Url" to pluginRepository,
            "Plugin-Has-Config" to "false",
        )
    }
}

tasks.register<Zip>("plugin") {
    group = "distribution"
    description = "Builds the installable Salt Player plugin archive"
    archiveFileName.set("saltplayer-gnome-lyrics-plugin-$pluginVersion.zip")
    destinationDirectory.set(layout.buildDirectory.dir("distributions"))

    into("classes") {
        with(tasks.named<Jar>("jar").get())
    }
    into("lib") {
        from(configurations.runtimeClasspath)
    }
    from(rootProject.file("LICENSE")) {
        rename { "COPYING" }
    }

    dependsOn(tasks.named("jar"))
}
