
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AudioLines, User, Mail, Lock } from "lucide-react";
import api from "../services/api";

function Register() {
    const navigate = useNavigate();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleRegister = async (e) => {
        e.preventDefault();

        setError("");
        setLoading(true);

        try {
            await api.post("/auth/register", {
                name,
                email,
                password
            });

            navigate("/login");

        } catch (error) {
            setError(
                error.response?.data?.message ||
                "Registration failed. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">

            <div className="auth-card">

                <div className="brand-icon">
                    <AudioLines size={38} />
                </div>

                <h1>NOVACORE</h1>

                <p className="subtitle">
                    The future of immersive audio
                </p>

                <h2>Create Account</h2>

                {error && (
                    <div className="error-message" role="alert">
                        {error}
                    </div>
                )}

                <form onSubmit={handleRegister}>

                    <label htmlFor="name">
                        Full Name
                    </label>

                    <div className="input-group">

                        <User size={20} />

                        <input
                            id="name"
                            type="text"
                            placeholder="Enter your name"
                            value={name}
                            onChange={(e) =>
                                setName(e.target.value)
                            }
                            autoComplete="name"
                            required
                        />

                    </div>

                    <label htmlFor="email">
                        Email Address
                    </label>

                    <div className="input-group">

                        <Mail size={20} />

                        <input
                            id="email"
                            type="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) =>
                                setEmail(e.target.value)
                            }
                            autoComplete="email"
                            required
                        />

                    </div>

                    <label htmlFor="password">
                        Password
                    </label>

                    <div className="input-group">

                        <Lock size={20} />

                        <input
                            id="password"
                            type="password"
                            placeholder="Minimum 8 characters"
                            value={password}
                            onChange={(e) =>
                                setPassword(e.target.value)
                            }
                            autoComplete="new-password"
                            minLength={8}
                            required
                        />

                    </div>

                    <button
                        type="submit"
                        className="primary-button"
                        disabled={loading}
                    >
                        {loading
                            ? "Creating Account..."
                            : "Create Account"}
                    </button>

                </form>

                <p className="auth-footer">
                    Already have an account?{" "}
                    <Link to="/login">
                        Sign In
                    </Link>
                </p>

            </div>

        </div>
    );
}

export default Register;
