(() => {
  try {
    const theme = window.localStorage.getItem('theme')
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme)
    }
  } catch {
    // The system theme remains the fallback when storage is unavailable.
  }
})()
