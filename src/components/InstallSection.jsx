import { useInstallState } from '../lib/install.js'

/**
 * The «install on this device» block in app settings.
 *
 * Deliberately four different texts rather than one button: only Chromium
 * hands us a real install prompt. On iOS the browser gives us nothing at all,
 * and the two taps that do the job (Поделиться → «На экран „Домой“») are the
 * kind of thing nobody finds on their own — so there we explain instead.
 */
export default function InstallSection() {
  const { canPrompt, installed, platform, promptInstall } = useInstallState()

  return (
    <div className="settings-field">
      <label>Приложение на устройстве</label>

      {installed ? (
        <div className="settings-hint">
          Установлено. Песни открываются с рабочего стола и без интернета.
        </div>
      ) : canPrompt ? (
        <>
          <button type="button" className="action-btn install-btn" onClick={promptInstall}>
            Установить
          </button>
          <div className="settings-hint">
            Иконка на рабочем столе, запуск без адресной строки, песни доступны без интернета.
          </div>
        </>
      ) : platform === 'ios' ? (
        <div className="settings-hint">
          В Safari: «Поделиться» <span aria-hidden="true">→</span> «На экран „Домой“».
          Из других браузеров на iPhone так не получится.
        </div>
      ) : (
        <div className="settings-hint">
          В меню браузера выберите «Установить приложение». Если пункта нет — приложение уже
          установлено или браузер его не поддерживает.
        </div>
      )}
    </div>
  )
}
