.PHONY: all plugin extension clean

all: plugin extension

plugin:
	./gradlew :saltplayer-plugin:plugin

extension:
	$(MAKE) -C gnome-extension pack

clean:
	./gradlew clean
	$(MAKE) -C gnome-extension clean
