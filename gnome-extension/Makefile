UUID := saltplayer-lyrics@troisfosref.github.io
SOURCE_DIR := $(UUID)
BUILD_DIR := build
ARCHIVE := $(BUILD_DIR)/$(UUID).zip
SCHEMA_DIR := $(SOURCE_DIR)/schemas

.PHONY: all pack install enable disable clean

all: pack

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

pack: $(BUILD_DIR)
	rm -f $(ARCHIVE)
	glib-compile-schemas $(SCHEMA_DIR)
	cd $(SOURCE_DIR) && zip -9r ../$(ARCHIVE) extension.js prefs.js metadata.json stylesheet.css COPYING schemas

install: pack
	gnome-extensions install --force $(ARCHIVE)

enable: install
	@if gnome-extensions list | grep -Fxq '$(UUID)'; then \
		gnome-extensions enable $(UUID); \
	else \
		echo '扩展已安装，但当前 GNOME Shell 尚未重新扫描新扩展。'; \
		echo '请注销并重新登录，然后再次运行 make enable。'; \
	fi

disable:
	gnome-extensions disable $(UUID)

clean:
	rm -rf $(BUILD_DIR)
	rm -f $(SCHEMA_DIR)/gschemas.compiled
