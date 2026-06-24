byId("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        const { data } = await Api.post("/api/auth/login", formDataObject(event.currentTarget));
        sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(data.user));
        window.location.href = "/dashboard";
    } catch (error) {
        setAlert(error.message, "danger");
    }
});
