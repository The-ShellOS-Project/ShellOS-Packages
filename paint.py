import tkinter as tk
from tkinter import filedialog, messagebox
from PIL import Image, ImageDraw, ImageTk
import os

class PaintApp:
    def __init__(self, root):
        self.root = root
        self.root.title("ShellOS Paint")

        self.canvas = tk.Canvas(self.root, bg='white', width=800, height=600)
        self.canvas.pack(fill=tk.BOTH, expand=True)

        # Variables
        self.color = 'black'
        self.brush_size = 5
        self.undo_stack = []
        self.redo_stack = []
        self.image = Image.new("RGB", (800, 600), "white")
        self.draw = ImageDraw.Draw(self.image)

        # Bind events
        self.canvas.bind("<B1-Motion>", self.paint)
        self.canvas.bind("<ButtonRelease-1>", self.save_state)

        # Setup menu and tools
        self.setup_menu()
        self.setup_tools()

    def setup_menu(self):
        menubar = tk.Menu(self.root)
        self.root.config(menu=menubar)

        # File menu
        file_menu = tk.Menu(menubar, tearoff=0)
        file_menu.add_command(label="Save", command=self.save_drawing)
        menubar.add_cascade(label="File", menu=file_menu)

        # Edit menu
        edit_menu = tk.Menu(menubar, tearoff=0)
        edit_menu.add_command(label="Undo", command=self.undo)
        edit_menu.add_command(label="Redo", command=self.redo)
        menubar.add_cascade(label="Edit", menu=edit_menu)

    def setup_tools(self):
        color_frame = tk.Frame(self.root)
        color_frame.pack(side=tk.LEFT, padx=10)

        colors = ['black', 'red', 'green', 'blue', 'yellow', 'purple', 'orange']
        for color in colors:
            btn = tk.Button(color_frame, bg=color, width=2, command=lambda c=color: self.change_color(c))
            btn.pack(pady=2)

        size_frame = tk.Frame(self.root)
        size_frame.pack(side=tk.LEFT, padx=10)

        sizes = [1, 2, 5, 10, 20]
        for size in sizes:
            btn = tk.Button(size_frame, text=str(size), command=lambda s=size: self.change_brush_size(s))
            btn.pack(pady=2)

        clear_btn = tk.Button(self.root, text="Clear", command=self.clear_canvas)
        clear_btn.pack(pady=10)

    def change_color(self, new_color):
        self.color = new_color

    def change_brush_size(self, new_size):
        self.brush_size = new_size

    def paint(self, event):
        x1, y1 = (event.x - self.brush_size), (event.y - self.brush_size)
        x2, y2 = (event.x + self.brush_size), (event.y + self.brush_size)
        self.canvas.create_oval(x1, y1, x2, y2, fill=self.color, outline=self.color)
        self.draw.ellipse([x1, y1, x2, y2], fill=self.color)

    def save_state(self, event=None):
        self.undo_stack.append(self.image.copy())
        self.redo_stack.clear()

    def undo(self):
        if self.undo_stack:
            self.redo_stack.append(self.image.copy())
            self.image = self.undo_stack.pop()
            self.draw = ImageDraw.Draw(self.image)
            self.redraw_canvas()

    def redo(self):
        if self.redo_stack:
            self.undo_stack.append(self.image.copy())
            self.image = self.redo_stack.pop()
            self.draw = ImageDraw.Draw(self.image)
            self.redraw_canvas()

    def clear_canvas(self):
        self.canvas.delete("all")
        self.image = Image.new("RGB", (800, 600), "white")
        self.draw = ImageDraw.Draw(self.image)
        self.save_state()

    def save_drawing(self):
        default_path = "System64/documents/Pictures"
        os.makedirs(default_path, exist_ok=True)
        file_path = filedialog.asksaveasfilename(
            initialdir=default_path,
            defaultextension=".png",
            filetypes=[("PNG files", "*.png"), ("All files", "*.*")]
        )
        if file_path:
            self.image.save(file_path)
            messagebox.showinfo("Save Successful", f"Drawing saved to {file_path}")

    def redraw_canvas(self):
        self.canvas.delete("all")
        self.tk_image = ImageTk.PhotoImage(self.image)
        self.canvas.create_image(0, 0, anchor=tk.NW, image=self.tk_image)

if __name__ == "__main__":
    root = tk.Tk()
    app = PaintApp(root)
    root.mainloop()
