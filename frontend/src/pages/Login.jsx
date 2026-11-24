import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AudioLines, Mail, Lock } from "lucide-react";
import api from "../services/api";

function Login() {
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const response = await api.post("/auth/login", {
                email,
                password
            });

            localStorage.setItem("token", response.data.token);

            localStorage.setItem(
                "user",
                JSON.stringify(response.data.user)
            );

            navigate("/dashboard");

        } catch (err) {
            setError(
                err.response?.data?.message || "Login failed"
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">

                <div className="brand-icon">
                    <AudioLines size={40} />
                </div>

                <h1>NOVACORE</h1>

                <p className="subtitle">
                    The future of immersive audio
                </p>

                <h2>Welcome Back</h2>

                {error && (
                    <p className="error-message">{error}</p>
                )}

                <form onSubmit={handleLogin}>

                    <label>Email Address</label>

                    <div className="input-group">
                        <Mail size={18} />
                        <input
                            type="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <label>Password</label>

                    <div className="input-group">
                        <Lock size={18} />
                        <input
                            type="password"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button
                        className="primary-button"
                        disabled={loading}
                    >
                        {loading ? "Signing in..." : "Sign In"}
                    </button>

                </form>

                <p className="auth-footer">
                    New to NOVACORE?{" "}
                    <Link to="/register">Create Account</Link>
                </p>

            </div>
        </div>
    );
}

export default Login;