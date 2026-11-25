const statusElement = document.getElementById("status");
const detailsElement = document.getElementById("details");

async function checkLocalService() {
  try {
    const response = await fetch(window.arkanDesktop.healthUrl);
    if (!response.ok) throw new Error("Local service returned " + response.status);
    const health = await response.json();

    statusElement.textContent = "Local service is running";
    detailsElement.textContent =
      "Database: " + health.database +
      " · Version: " + health.version +
      " · " + new Date(health.timestamp).toLocaleTimeString();
  } catch (error) {
    statusElement.textContent = "Local service is unavailable";
    detailsElement.textContent = error.message;
  }
}

checkLocalService();
