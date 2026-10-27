-- Actividad 15 - Base de datos del laboratorio de seguridad
CREATE DATABASE IF NOT EXISTS iw_seguridad CHARACTER SET utf8mb4;
USE iw_seguridad;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('usuario','admin') NOT NULL DEFAULT 'usuario',
  email_verificado BOOLEAN NOT NULL DEFAULT FALSE,
  token_verificacion_hash CHAR(64) NULL,
  token_verificacion_expira DATETIME NULL,
  totp_secreto VARCHAR(100) NULL,
  totp_habilitado BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS servicios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  precio DECIMAL(10,2) NOT NULL
);

INSERT INTO servicios (nombre, descripcion, precio) VALUES
  ('Soporte técnico', 'Asistencia a equipos', 25000),
  ('Diseño web', 'Desarrollo de sitios', 180000);
