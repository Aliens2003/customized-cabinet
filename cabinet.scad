// 250 x 235 x 180 mm one-piece honeycomb cabinet. Units mm.
// Front: y=0. No joints, hardware or glue. Print shell back-down.
part = "assembly"; // [assembly,shell,shell_print,drawer,exploded]
width = 250;
depth = 235;
height = 180;
wall = 4;
top_thickness = 5;
frame = 10;
hex_flat = 12; // [8:1:18] Hexagon opening across flats
hex_web = 2.4; // [2:0.2:4] Minimum distance between neighboring holes
side_clearance = 1;
drawer_width = width-2*wall-2*side_clearance;
drawer_depth = depth-wall-2;
face_height = 84;
tray_height = 78;
drawer_wall = 2.4;
drawer_floor = 2.4;
face_thickness = 3;
rail_projection = 8;
rail_thickness = 3;
lower_level = wall;
upper_level = 90;
open_lower = 60; // [0:100]
$fn=32;
eps=0.02;
assert(width<=256 && depth<=256 && height<=256);
assert(upper_level+face_height<=height-top_thickness-1);
assert(lower_level+tray_height<=upper_level-rail_thickness-1);
assert(lower_level+face_height<upper_level);
assert(hex_web>=2 && frame>=wall);
// Centered complete-cell lattice; a closed rectangular perimeter surrounds every panel.
module hex_holes(w,h){
 r=hex_flat/sqrt(3); dx=hex_flat+hex_web; dy=dx*sqrt(3)/2;
 rows=floor((h-2*r)/dy)+1;
 for(j=[0:rows-1])let(cy=h/2+(j-(rows-1)/2)*dy)
 for(k=[-ceil(w/dx):ceil(w/dx)])let(cx=w/2+(k+(j%2)/2)*dx)
 if(cx-hex_flat/2>=0 && cx+hex_flat/2<=w)
 translate([cx,cy])rotate(30)circle(r=r,$fn=6);
}
module panel_2d(w,h,side=false){
 difference(){
 square([w,h]);
 difference(){
 translate([frame,frame])hex_holes(w-2*frame,h-2*frame);
 // Solid attachment belt behind the upper rail, 1.2 mm margin each side.
 // Subtracting the belt from cutters preserves it in the side panels.
 if(side)translate([-eps,upper_level-rail_thickness-1.2])square([w+2*eps,rail_thickness+2.4]);
 }
 }
}
module side_panel(){
 // local u,v,w -> global y,z,x
 multmatrix([[0,0,1,0],[1,0,0,0],[0,1,0,0],[0,0,0,1]])
 linear_extrude(wall)panel_2d(depth,height,true);
}
module shell(){
 union(){
 side_panel();translate([width-wall,0,0])side_panel();
 linear_extrude(wall)panel_2d(width,depth);
 translate([0,0,height-top_thickness])linear_extrude(top_thickness)panel_2d(width,depth);
 translate([0,depth,0])rotate([90,0,0])linear_extrude(wall)panel_2d(width,height);
 // One upper rail per side; joined to the narrow attachment belt.
 for(x=[wall,width-wall-rail_projection]){
 translate([x,5,upper_level-rail_thickness])cube([rail_projection,depth-wall-5,rail_thickness]);

 }
 }
}
module grip(){
 translate([drawer_width/2,face_thickness+eps,face_height-14])rotate([90,0,0])linear_extrude(face_thickness+2*eps)
 hull(){for(x=[-28,28],z=[4,22])translate([x,z])circle(r=4);}
}
module drawer(){
 difference(){
 union(){
 cube([drawer_width,drawer_depth,drawer_floor]);
 cube([drawer_width,face_thickness,face_height]);
 for(x=[0,drawer_width-drawer_wall])translate([x,face_thickness,0])cube([drawer_wall,drawer_depth-face_thickness,tray_height]);
 translate([0,drawer_depth-drawer_wall,0])cube([drawer_width,drawer_wall,tray_height]);
 }
 grip();
 }
}
module assembly(){
 color([.8,.79,.75])shell();
 color([.3,.33,.36]){
 translate([wall+side_clearance,0,upper_level])drawer();
 translate([wall+side_clearance,-open_lower,lower_level])drawer();
 }
}
if(part=="assembly")assembly();
else if(part=="shell")shell();
else if(part=="shell_print")translate([0,0,depth])rotate([-90,0,0])shell();
else if(part=="drawer")drawer();
else if(part=="exploded"){
 color([.8,.79,.75])shell();
 color([.3,.33,.36])for(z=[lower_level,upper_level+35])translate([wall+side_clearance,-depth-25,z])drawer();
}
