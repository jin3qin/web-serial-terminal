// Package systray provides system tray functionality.
package systray

import (
	"fmt"

	"web-serial-terminal/internal/browser"

	"github.com/getlantern/systray"
)

// Tray represents the system tray instance.
type Tray struct {
	url     string
	version string
	quit    chan struct{}
}

// New creates a new system tray instance.
func New(url, version string) *Tray {
	return &Tray{
		url:     url,
		version: version,
		quit:    make(chan struct{}),
	}
}

// Run starts the system tray.
func (t *Tray) Run() {
	systray.Run(t.onReady, t.onExit)
}

// Quit signals the tray to quit.
func (t *Tray) Quit() {
	close(t.quit)
}

func (t *Tray) onReady() {
	// Set tray icon
	systray.SetIcon(iconData)
	systray.SetTitle("Web Serial Terminal")
	systray.SetTooltip(fmt.Sprintf("Web Serial Terminal %s", t.version))

	// Add menu items
	mOpen := systray.AddMenuItem("打开网页", "在浏览器中打开控制页面")
	mSettings := systray.AddMenuItem("设置", "配置端口号等设置")
	systray.AddSeparator()
	mAbout := systray.AddMenuItem("关于", "显示版本信息")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("退出", "关闭程序")

	// Handle menu clicks
	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				_ = browser.OpenURL(t.url)
			case <-mSettings.ClickedCh:
				_ = browser.OpenURL(t.url + "/settings")
			case <-mAbout.ClickedCh:
				_ = browser.OpenURL(t.url)
			case <-mQuit.ClickedCh:
				systray.Quit()
				return
			case <-t.quit:
				systray.Quit()
				return
			}
		}
	}()
}

func (t *Tray) onExit() {
	// Cleanup if needed
}