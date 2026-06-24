byId("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        const { data } = await Api.post("/api/auth/login", formDataObject(event.currentTarget));
        cacheAuthData(data);
        window.location.href = "/dashboard";
    } catch (error) {
        setAlert(error.message, "danger");
    }
});
