byId("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        await Api.post("/api/auth/login", formDataObject(event.currentTarget));
        window.location.href = "/dashboard";
    } catch (error) {
        setAlert(error.message, "danger");
    }
});
