package io.github.saltplayer.lyrics

data class LyricsSnapshot(
    val text: String = "",
    val translation: String = "",
    val title: String = "",
    val artist: String = "",
    val startTime: Long = 0,
    val endTime: Long = 0,
    val playing: Boolean = false,
    val available: Boolean = false,
    val sequence: Long = 0,
) {
    fun toJson(): String = buildString {
        append('{')
        appendJsonString("text", text)
        append(',')
        appendJsonString("translation", translation)
        append(',')
        appendJsonString("title", title)
        append(',')
        appendJsonString("artist", artist)
        append(",\"startTime\":").append(startTime)
        append(",\"endTime\":").append(endTime)
        append(",\"playing\":").append(playing)
        append(",\"available\":").append(available)
        append(",\"sequence\":").append(sequence)
        append('}')
    }

    private fun StringBuilder.appendJsonString(name: String, value: String) {
        append('"').append(name).append("\":\"")
        value.forEach { character ->
            when (character) {
                '"' -> append("\\\"")
                '\\' -> append("\\\\")
                '\b' -> append("\\b")
                '\u000C' -> append("\\f")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> {
                    if (character.code < 0x20) {
                        append("\\u")
                        append(character.code.toString(16).padStart(4, '0'))
                    } else {
                        append(character)
                    }
                }
            }
        }
        append('"')
    }
}
